"""Application entrypoint for BitAxeTool: Launches desktop GUI or headless LAN server."""

import os
import sys
import time
import socket
import logging
import argparse
import threading
import webbrowser
import subprocess

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Verify dependencies before proceeding
try:
    import uvicorn
    import fastapi
except (ImportError, ModuleNotFoundError):
    is_win = sys.platform.startswith("win")
    venv_python = (
        os.path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
        if is_win
        else os.path.join(PROJECT_ROOT, ".venv", "bin", "python")
    )
    if os.path.exists(venv_python) and os.path.abspath(sys.executable).lower() != os.path.abspath(venv_python).lower():
        print(f"[*] Switching to virtual environment: {venv_python}")
        os.execv(venv_python, [venv_python] + sys.argv)

    req_file = os.path.join(PROJECT_ROOT, "requirements.txt")
    if os.path.exists(req_file):
        print("[*] Installing missing dependencies...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--prefer-binary", "-r", req_file])
        except Exception:
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", "--prefer-binary",
                "fastapi", "uvicorn", "websockets", "httpx", "pydantic", "zeroconf", "qrcode"
            ])
        import uvicorn
    else:
        print("\n[FEHLER] 'uvicorn' fehlt. Bitte führe 'pip install -r requirements.txt' aus.\n")
        sys.exit(1)

from app.config import load_config
from app.server import set_active_port, APP_VERSION

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("BitAxeTool")


def get_lan_ip() -> str:
    """Retrieve primary local IPv4 address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def find_available_port(preferred_port: int = 21420) -> int:
    """Test if preferred_port is open. If occupied, scan upwards to find a free port."""
    for p in range(preferred_port, preferred_port + 50):
        try:
            s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            s.bind(("::", p))
            s.close()
            return p
        except Exception:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s4:
                    s4.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    s4.bind(("0.0.0.0", p))
                    return p
            except OSError:
                logger.warning(f"Port {p} ist bereits in Benutzung (Kollisionsschutz aktiv). Prüfe nächsten Port...")
                continue

    return preferred_port


def create_dual_stack_socket(port: int) -> socket.socket:
    """Create a dual-stack TCP listening socket supporting IPv4 and IPv6 simultaneously."""
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # Enable dual-stack: listen on both IPv4 (0.0.0.0, 127.0.0.1, LAN IP) and IPv6 (::, ::1)
        s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        s.bind(("::", port))
        s.listen(128)
        logger.info(f"Dual-Stack Webserver aktiv auf Port {port} (IPv4 + IPv6 localhost/LAN)")
        return s
    except Exception as e:
        logger.warning(f"Dual-Stack IPv6 Socket nicht verfügbar ({e}), weiche auf IPv4 aus...")
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("0.0.0.0", port))
        s.listen(128)
        return s


def print_banner(lan_ip: str, port: int, headless: bool = False):
    """Print modern ASCII startup banner with LAN connection URLs."""
    banner = f"""
========================================================================
    ____  _ __     ___            ______            __
   / __ )(_) /_   /   |_  _____  /_  __/___  ____  / /
  / __  / / __/  / /| | |/_/ _ \\  / / / __ \\/ __ \\/ / 
 / /_/ / / /_   / ___ |_>  </  __/ / / / /_/ / /_/ / /  
/_____/_/\\__/  /_/  |_/_/|_|\\___/ /_/  \\____/\\____/_/   
                                                        
            Bitaxe Multi-AutoTuner & Safety Governor v{APP_VERSION}
========================================================================
 [*] Desktop Interface:   http://127.0.0.1:{port}
 [*] Lokaler Hostname:    http://localhost:{port}
 [*] Lokales Netz (LAN):  http://{lan_ip}:{port}
 [*] Mobiler Zugriff:     LAN-URL auf iPhone / iPad öffnen
 [*] Betriebsmodus:       {"Headless / LAN Web Server" if headless else "Natives Windows Desktop-Fenster (WebView2)"}
========================================================================
"""
    print(banner)


def run_web_server(sock: socket.socket):
    """Run Uvicorn ASGI server hosting FastAPI on the bound socket."""
    from app.server import app
    config = uvicorn.Config(app, log_level="warning", access_log=False)
    server = uvicorn.Server(config)
    server.run(sockets=[sock])


def main():
    parser = argparse.ArgumentParser(description=f"BitAxeTool v{APP_VERSION} - Multi-AutoTuner for Bitaxe Solo Miners")
    parser.add_argument("--host", default=None, help="Binding host address")
    parser.add_argument("--port", type=int, default=None, help="Port to listen on (default: 21420)")
    parser.add_argument("--headless", action="store_true", help="Run without opening GUI window")
    parser.add_argument("--browser", action="store_true", help="Open default web browser instead of pywebview")
    args = parser.parse_args()

    cfg = load_config()
    requested_port = args.port or cfg.web_port or 21420

    # Ensure port is not colliding with other programs (like vulkan / dev servers)
    port = find_available_port(requested_port)
    set_active_port(port)

    lan_ip = get_lan_ip()
    headless = args.headless

    print_banner(lan_ip, port, headless=headless)

    # Bind dual-stack socket before launching thread
    server_socket = create_dual_stack_socket(port)

    # Start FastAPI server in background thread
    server_thread = threading.Thread(target=run_web_server, args=(server_socket,), daemon=True)
    server_thread.start()

    # Wait briefly for server startup
    time.sleep(1.0)

    app_url = f"http://127.0.0.1:{port}"

    if headless:
        logger.info("Server läuft im Headless-Modus. Beenden mit Strg+C.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Beende Server...")
            sys.exit(0)

    # Try PyWebView for a native Windows 10/11 desktop window
    if not args.browser:
        try:
            import webview

            icon_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "bitaxe_icon.ico"))
            if not os.path.exists(icon_path):
                icon_path = None

            logger.info("Erstelle natives Windows-Anwendungsfenster...")
            window = webview.create_window(
                title=f"BitAxeTool v{APP_VERSION} - Solo Miner Governor",
                url=app_url,
                width=1340,
                height=860,
                min_size=(380, 620),
                background_color="#0B0F17",
                text_select=True
            )
            webview.start(icon=icon_path)
            sys.exit(0)
        except Exception as e:
            logger.warning(f"Natives Desktop-Fenster nicht gestartet ({e}). Öffne Web-Browser...")

    # Fallback to standard web browser
    logger.info(f"Öffne Browser unter {app_url}...")
    webbrowser.open(app_url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Beende BitAxeTool...")
        sys.exit(0)


if __name__ == "__main__":
    main()
