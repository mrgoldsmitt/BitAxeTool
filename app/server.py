"""FastAPI REST API, WebSocket live streaming, persistent disk logger, and static asset server for BitAxeTool."""

import os
import asyncio
import io
import time
import socket
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import qrcode
from contextlib import asynccontextmanager

from app.models import (
    AppConfig, MinerConfig, MinerTelemetry, LogEntry, ManualTuneRequest, ScanRequest
)
from app.config import load_config, save_config, get_or_create_miner_config
from app.tuner import TunerManager
from app.scanner import scan_network, get_local_ip_and_subnet
from app.bitaxe_client import BitAxeClient

APP_VERSION = "2.1.0"
logger = logging.getLogger("BitAxeTool.server")

# Active Port tracking
ACTIVE_PORT: int = 21420

def set_active_port(port: int) -> None:
    global ACTIVE_PORT
    ACTIVE_PORT = port

def get_active_port() -> int:
    return ACTIVE_PORT

# Persistent disk logging
LOG_DIR = os.path.abspath("logs")
LOG_FILE = os.path.join(LOG_DIR, "bitaxe_monitor.log")

def write_log_to_disk(entry: LogEntry) -> None:
    """Append log entry to persistent log file on disk."""
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            ip_str = f"[{entry.miner_ip}] " if entry.miner_ip else ""
            f.write(f"[{entry.timestamp}] [{entry.level.upper()}] {ip_str}{entry.message}\n")
    except Exception as e:
        logger.debug(f"Failed to write log to disk: {e}")

# In-memory log buffer (stores last 500 entries)
LOG_BUFFER: List[LogEntry] = []
MAX_LOGS = 500

# Active WebSocket connections
connected_websockets: List[WebSocket] = []

async def broadcast_log_to_websockets(entry: LogEntry) -> None:
    """Asynchronously send new log entry to all active WebSockets."""
    if not connected_websockets:
        return
    payload = {
        "type": "log",
        "data": entry.model_dump()
    }
    dead_sockets = []
    for ws in list(connected_websockets):
        try:
            await ws.send_json(payload)
        except Exception:
            dead_sockets.append(ws)
    for ws in dead_sockets:
        if ws in connected_websockets:
            connected_websockets.remove(ws)

def add_log(entry: LogEntry) -> None:
    """Store log entry in memory buffer, write to disk, and broadcast to active WebSockets."""
    if not entry.timestamp:
        entry.timestamp = time.strftime("%H:%M:%S")

    LOG_BUFFER.append(entry)
    if len(LOG_BUFFER) > MAX_LOGS:
        LOG_BUFFER.pop(0)

    # Write to disk
    write_log_to_disk(entry)

    # Broadcast to active WebSockets in real time
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(broadcast_log_to_websockets(entry))
    except RuntimeError:
        pass


# Tuner Manager
tuner_mgr = TunerManager(log_sink=add_log)


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    """Lifespan event handler for clean startup and shutdown."""
    config = load_config()
    tuner_mgr.sync_miners(config.miners)
    add_log(LogEntry(
        timestamp=time.strftime("%H:%M:%S"),
        level="success",
        message=f"BitAxeTool v{APP_VERSION} Engine gestartet. Verwaltet {len(config.miners)} Miner."
    ))
    broadcast_task = asyncio.create_task(broadcast_telemetry_loop())
    yield
    broadcast_task.cancel()
    tuner_mgr.stop_all()


# Initialize FastAPI application
app = FastAPI(title="BitAxeTool Manager", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def broadcast_telemetry_loop():
    """Pushes live metrics to all connected clients every second."""
    while True:
        try:
            if connected_websockets:
                telemetry = [t.model_dump() for t in tuner_mgr.get_all_telemetry()]
                payload = {
                    "type": "telemetry",
                    "data": telemetry
                }
                dead_sockets = []
                for ws in list(connected_websockets):
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead_sockets.append(ws)
                for ws in dead_sockets:
                    if ws in connected_websockets:
                        connected_websockets.remove(ws)
        except Exception as e:
            logger.debug(f"Broadcast error: {e}")
        await asyncio.sleep(1.0)


# --- REST API Endpoints ---

@app.get("/api/version")
async def get_version_info():
    """Return application version and metadata."""
    return {
        "version": APP_VERSION,
        "appName": "BitAxeTool",
        "author": "mrgoldsmitt",
        "description": "Multi-AutoTuner & Safety Governor for Bitaxe Solo Miners"
    }


@app.get("/api/changelog", response_class=PlainTextResponse)
async def get_changelog():
    """Return CHANGELOG.md contents."""
    changelog_path = os.path.abspath("CHANGELOG.md")
    if os.path.exists(changelog_path):
        with open(changelog_path, "r", encoding="utf-8") as f:
            return f.read()
    return "# Changelog\n\nKein Changelog gefunden."


@app.get("/api/config", response_model=AppConfig)
async def get_configuration():
    return load_config()


@app.post("/api/config")
async def update_configuration(new_config: AppConfig):
    save_config(new_config)
    tuner_mgr.sync_miners(new_config.miners)
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="success", message="Anwendungskonfiguration gespeichert."))
    return {"status": "success", "message": "Konfiguration gespeichert."}


@app.get("/api/miners", response_model=List[MinerConfig])
async def list_miners():
    return load_config().miners


@app.post("/api/miners")
async def add_miner(miner_data: Dict[str, Any]):
    ip = miner_data.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="IP-Adresse ist erforderlich.")

    config = load_config()
    if any(m.ip == ip for m in config.miners):
        raise HTTPException(status_code=400, detail=f"Miner mit IP {ip} ist bereits vorhanden.")

    nickname = miner_data.get("nickname", "")
    model = miner_data.get("model", "Unknown")
    new_miner = get_or_create_miner_config(ip, model=model, nickname=nickname)

    # Override any user provided fields
    for k, v in miner_data.items():
        if hasattr(new_miner, k) and v is not None and v != "":
            setattr(new_miner, k, v)

    config.miners.append(new_miner)
    save_config(config)
    tuner_mgr.sync_miners(config.miners)
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="success", miner_ip=ip, message=f"Miner hinzugefügt: {new_miner.nickname or ip}"))
    return new_miner


@app.put("/api/miners/{ip}")
async def update_miner_settings(ip: str, updated_fields: Dict[str, Any]):
    config = load_config()
    target = next((m for m in config.miners if m.ip == ip), None)
    if not target:
        raise HTTPException(status_code=404, detail="Miner nicht gefunden.")

    for k, v in updated_fields.items():
        if hasattr(target, k) and v is not None:
            setattr(target, k, v)

    save_config(config)
    tuner_mgr.sync_miners(config.miners)
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="info", miner_ip=ip, message="Miner-Einstellungen aktualisiert."))
    return target


@app.delete("/api/miners/{ip}")
async def remove_miner_by_ip(ip: str):
    config = load_config()
    initial_len = len(config.miners)
    config.miners = [m for m in config.miners if m.ip != ip]
    if len(config.miners) == initial_len:
        raise HTTPException(status_code=404, detail="Miner nicht gefunden.")

    save_config(config)
    tuner_mgr.sync_miners(config.miners)
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="warning", miner_ip=ip, message=f"Miner {ip} aus Konfiguration entfernt."))
    return {"status": "success", "message": f"Miner {ip} entfernt."}


@app.get("/api/telemetry", response_model=List[MinerTelemetry])
async def get_all_telemetry():
    return tuner_mgr.get_all_telemetry()


@app.get("/api/logs", response_model=List[LogEntry])
async def get_logs():
    return LOG_BUFFER


@app.get("/api/logs/download")
async def download_log_file():
    """Download the full persistent log file."""
    if os.path.exists(LOG_FILE):
        return FileResponse(
            LOG_FILE,
            filename=f"bitaxe_monitor_{time.strftime('%Y%m%d_%H%M%S')}.log",
            media_type="text/plain"
        )
    return PlainTextResponse("Noch keine Log-Einträge vorhanden.")


@app.post("/api/logs/clear")
async def clear_logs():
    """Clear memory log buffer and reset log file."""
    global LOG_BUFFER
    LOG_BUFFER.clear()
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%H:%M:%S')}] [INFO] Logdatei zurückgesetzt.\n")
    except Exception:
        pass
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="info", message="Protokoll zurückgesetzt."))
    return {"status": "success"}


@app.post("/api/scan")
async def trigger_network_scan(req: ScanRequest):
    """Run concurrent asynchronous network scan."""
    subnet = req.subnet or get_local_ip_and_subnet()
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="info", message=f"Netzwerkbereich {subnet} wird durchsucht..."))
    miners = await scan_network(subnet)
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="success", message=f"Suchlauf beendet: {len(miners)} Bitaxe-Miner gefunden."))
    return {"subnet": subnet, "found_count": len(miners), "miners": miners}


@app.post("/api/miner/{ip}/restart")
async def restart_miner(ip: str):
    client = BitAxeClient(ip)
    ok, msg = await client.restart()
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="warning" if ok else "error", miner_ip=ip, message=f"Neustart: {msg}"))
    return {"success": ok, "message": msg}


@app.post("/api/miner/{ip}/identify")
async def identify_miner(ip: str):
    client = BitAxeClient(ip)
    ok, msg = await client.identify()
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="info" if ok else "error", miner_ip=ip, message=f"Identifizieren: {msg}"))
    return {"success": ok, "message": msg}


@app.post("/api/miner/{ip}/tune")
async def manual_tune_miner(ip: str, req: ManualTuneRequest):
    client = BitAxeClient(ip)
    ok, msg = await client.apply_tuning(req.frequency, req.voltage)
    add_log(LogEntry(timestamp=time.strftime("%H:%M:%S"), level="info" if ok else "error", miner_ip=ip, message=f"Manuelle Taktung: {msg}"))
    return {"success": ok, "message": msg}


@app.get("/api/network-info")
async def get_network_info():
    """Retrieve LAN IP addresses and suggested connection URLs."""
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    port = get_active_port()
    lan_url = f"http://{local_ip}:{port}"
    local_url = f"http://127.0.0.1:{port}"
    localhost_url = f"http://localhost:{port}"

    return {
        "local_ip": local_ip,
        "lan_url": lan_url,
        "local_url": local_url,
        "localhost_url": localhost_url,
        "port": port,
        "subnet": get_local_ip_and_subnet(),
        "version": APP_VERSION
    }


@app.get("/api/qrcode")
async def get_connection_qrcode():
    """Generates a QR code vector SVG/PNG of the LAN URL for instant scanning with iPhone/iPad."""
    info = await get_network_info()
    lan_url = info["lan_url"]

    try:
        from qrcode.image.svg import SvgImage
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=8,
            border=2,
            image_factory=SvgImage
        )
        qr.add_data(lan_url)
        qr.make(fit=True)
        img = qr.make_image()
        buf = io.BytesIO()
        img.save(buf)
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/svg+xml")
    except Exception:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=8,
            border=2,
        )
        qr.add_data(lan_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#F59E0B", back_color="#111827")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")


# --- WebSocket Endpoint ---

@app.websocket("/ws/live")
async def websocket_live_stream(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    try:
        telemetry = [t.model_dump() for t in tuner_mgr.get_all_telemetry()]
        await websocket.send_json({
            "type": "init",
            "telemetry": telemetry,
            "logs": [l.model_dump() for l in LOG_BUFFER[-100:]]
        })
        while True:
            # Keep-alive ping/pong
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)
    except Exception:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)


# Mount static assets directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/favicon.ico")
async def serve_favicon():
    ico_path = os.path.join(os.path.dirname(__file__), "..", "assets", "bitaxe_icon.ico")
    if os.path.exists(ico_path):
        return FileResponse(ico_path, media_type="image/x-icon")
    return HTMLResponse("", status_code=204)


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>BitAxeTool API Running</h1><p>Static UI not yet loaded.</p>")
