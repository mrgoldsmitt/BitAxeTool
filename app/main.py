"""Application entrypoint for BitAxeTool: Launches desktop GUI or headless LAN server."""

import os
import sys
import time
import socket
import logging
import argparse
import threading
import multiprocessing
import webbrowser
import subprocess

# Safe stream proxy for GUI/windowed modes where sys.stdout/stderr is None
class SafeStream:
    def __init__(self, target_file=None):
        self.target_file = target_file

    def write(self, s):
        if self.target_file:
            try:
                self.target_file.write(s)
                self.target_file.flush()
            except Exception:
                pass

    def flush(self):
        if self.target_file:
            try:
                self.target_file.flush()
            except Exception:
                pass

    def isatty(self):
        return False


# Ensure project root is in sys.path and set working directory
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(sys.executable)
    INTERNAL_DIR = getattr(sys, "_MEIPASS", APP_DIR)
    if INTERNAL_DIR not in sys.path:
        sys.path.insert(0, INTERNAL_DIR)
    PROJECT_ROOT = APP_DIR
else:
    PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    INTERNAL_DIR = PROJECT_ROOT

try:
    os.chdir(PROJECT_ROOT)
except Exception:
    pass

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Setup log directory and stream redirection
log_dir = os.path.join(PROJECT_ROOT, "logs")
try:
    os.makedirs(log_dir, exist_ok=True)
    _gui_log_path = os.path.join(log_dir, "bitaxe_app.log")
    _log_fp = open(_gui_log_path, "a", encoding="utf-8")
except Exception:
    _gui_log_path = None
    _log_fp = None

if sys.stdout is None or not hasattr(sys.stdout, "write"):
    sys.stdout = SafeStream(_log_fp)
if sys.stderr is None or not hasattr(sys.stderr, "write"):
    sys.stderr = SafeStream(_log_fp)

# Configure logging
log_handlers = [logging.StreamHandler(sys.stdout)]
if _gui_log_path:
    try:
        log_handlers.append(logging.FileHandler(_gui_log_path, encoding="utf-8"))
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=log_handlers
)
logger = logging.getLogger("BitAxeTool")

# Verify dependencies before proceeding (only in non-frozen script mode)
if not getattr(sys, "frozen", False):
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
            logger.info(f"Switching to virtual environment: {venv_python}")
            os.execv(venv_python, [venv_python] + sys.argv)

        req_file = os.path.join(PROJECT_ROOT, "requirements.txt")
        if os.path.exists(req_file):
            logger.info("Installing missing dependencies...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "--prefer-binary", "-r", req_file])
            except Exception:
                subprocess.check_call([
                    sys.executable, "-m", "pip", "install", "--prefer-binary",
                    "fastapi", "uvicorn", "websockets", "httpx", "pydantic", "zeroconf", "qrcode"
                ])
            import uvicorn
        else:
            logger.error("'uvicorn' fehlt. Bitte führe 'pip install -r requirements.txt' aus.")
            sys.exit(1)
else:
    import uvicorn
    import fastapi

from app.config import load_config
from app.server import set_active_port, APP_VERSION


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


def find_available_port(preferred_port: int = 21420, host: str = "0.0.0.0") -> int:
    """Test if preferred_port is open. If occupied, scan upwards to find a free port."""
    test_host = "127.0.0.1" if host == "0.0.0.0" else host
    for p in range(preferred_port, preferred_port + 50):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((test_host, p))
                return p
        except OSError:
            logger.warning(f"Port {p} ist bereits in Benutzung (Kollisionsschutz aktiv). Prüfe nächsten Port...")
            continue

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((test_host, 0))
        return s.getsockname()[1]


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
    logger.info(banner)


def run_web_server(host: str, port: int, server_holder: dict):
    """Run Uvicorn ASGI server hosting FastAPI."""
    try:
        from app.server import app
        config = uvicorn.Config(
            app,
            host=host,
            port=port,
            log_config=None,  # Do not invoke uvicorn's color-checking default log_config
            access_log=False,
            timeout_keep_alive=30
        )
        server = uvicorn.Server(config)
        server_holder["server"] = server
        logger.info(f"Starte Uvicorn Webserver auf {host}:{port}...")
        server.run()
    except Exception as e:
        logger.error(f"Fehler beim Starten des Uvicorn-Webservers: {e}", exc_info=True)


def main():
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser(description=f"BitAxeTool v{APP_VERSION} - Multi-AutoTuner for Bitaxe Solo Miners")
    parser.add_argument("--host", default=None, help="Binding host address")
    parser.add_argument("--port", type=int, default=None, help="Port to listen on (default: 21420)")
    parser.add_argument("--headless", action="store_true", help="Run without opening GUI window")
    parser.add_argument("--browser", action="store_true", help="Open default web browser instead of pywebview")
    args = parser.parse_args()

    cfg = load_config()
    host = args.host or cfg.host or "0.0.0.0"
    requested_port = args.port or cfg.web_port or 21420

    # Ensure port is not colliding with other programs (like vulkan / dev servers)
    port = find_available_port(requested_port, host)
    set_active_port(port)

    lan_ip = get_lan_ip()
    headless = args.headless

    print_banner(lan_ip, port, headless=headless)

    # Start FastAPI server in background thread
    server_holder = {}
    server_thread = threading.Thread(target=run_web_server, args=(host, port, server_holder), daemon=True)
    server_thread.start()

    # Synchronize: wait until the server responds on localhost:port
    server_ready = False
    for _ in range(40):  # up to 8 seconds
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                server_ready = True
                break
        except OSError:
            time.sleep(0.2)

    if not server_ready:
        logger.error(f"Webserver konnte auf Port {port} nicht rechtzeitig gebunden werden!")
    else:
        logger.info(f"Webserver erfolgreich gebunden auf Port {port}.")

    app_url = f"http://127.0.0.1:{port}"

    if headless:
        logger.info("Server läuft im Headless-Modus. Beenden mit Strg+C.")
        try:
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            logger.info("Beende Server...")
            if "server" in server_holder and server_holder["server"]:
                server_holder["server"].should_exit = True
            sys.exit(0)

    # Try PyWebView for a native Windows 10/11 desktop window
    if not args.browser:
        try:
            import webview

            icon_path = os.path.abspath(os.path.join(PROJECT_ROOT, "assets", "bitaxe_icon.ico"))
            if not os.path.exists(icon_path):
                icon_path = os.path.abspath(os.path.join(INTERNAL_DIR, "assets", "bitaxe_icon.ico"))
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

            # Windows System Tray Integration (Minimieren in Infobereich)
            tray_holder = {"tray": None}

            def setup_tray():
                if not sys.platform.startswith("win"):
                    return
                try:
                    import clr
                    clr.AddReference("System.Windows.Forms")
                    clr.AddReference("System.Drawing")
                    from System.Windows.Forms import (
                        NotifyIcon, ContextMenuStrip, ToolStripMenuItem, ToolStripSeparator,
                        ToolTipIcon, MouseButtons, Cursor
                    )
                    from System.Drawing import Icon, Font, FontStyle
                    from System.Reflection import BindingFlags

                    tray = NotifyIcon()
                    tray_holder["tray"] = tray
                    if icon_path and os.path.exists(icon_path):
                        tray.Icon = Icon(icon_path)
                    tray.Text = f"BitAxeTool v{APP_VERSION}"

                    menu = ContextMenuStrip()
                    item_open = ToolStripMenuItem("BitAxeTool öffnen")
                    item_open.Font = Font(item_open.Font, FontStyle.Bold)
                    item_browser = ToolStripMenuItem("Im Web-Browser öffnen")
                    sep1 = ToolStripSeparator()
                    item_exit = ToolStripMenuItem("Komplett schließen")

                    show_context_menu_method = clr.GetClrType(NotifyIcon).GetMethod(
                        "ShowContextMenu", BindingFlags.Instance | BindingFlags.NonPublic
                    )

                    def on_restore_clicked(sender=None, e=None):
                        try:
                            window.show()
                            window.restore()
                            window.focus()
                        except Exception as ex:
                            logger.debug(f"Tray restore error: {ex}")

                    def on_browser_clicked(sender=None, e=None):
                        try:
                            webbrowser.open(app_url)
                        except Exception as ex:
                            logger.debug(f"Open browser error: {ex}")

                    def on_exit_clicked(sender=None, e=None):
                        try:
                            if tray:
                                tray.Visible = False
                                tray.Dispose()
                        except Exception:
                            pass
                        if "server" in server_holder and server_holder["server"]:
                            server_holder["server"].should_exit = True
                        try:
                            window.destroy()
                        except Exception:
                            pass
                        import os
                        os._exit(0)

                    def on_tray_mouse_click(sender, e):
                        # Bei Linksklick oder Rechtsklick das Auswahlmenü (Öffnen / Komplett schließen) anzeigen
                        if e.Button == MouseButtons.Left:
                            try:
                                if show_context_menu_method:
                                    show_context_menu_method.Invoke(tray, None)
                                else:
                                    menu.Show(Cursor.Position)
                            except Exception:
                                try:
                                    menu.Show(Cursor.Position)
                                except Exception:
                                    on_restore_clicked()

                    item_open.Click += on_restore_clicked
                    item_browser.Click += on_browser_clicked
                    item_exit.Click += on_exit_clicked
                    tray.MouseClick += on_tray_mouse_click
                    tray.DoubleClick += on_restore_clicked
                    tray.BalloonTipClicked += on_restore_clicked

                    menu.Items.Add(item_open)
                    menu.Items.Add(item_browser)
                    menu.Items.Add(sep1)
                    menu.Items.Add(item_exit)
                    tray.ContextMenuStrip = menu
                    tray.Visible = True

                    def on_minimized(*a):
                        try:
                            window.hide()
                            if tray:
                                tray.Visible = True
                                tray.ShowBalloonTip(
                                    2500,
                                    "BitAxeTool minimiert",
                                    "BitAxeTool läuft im System-Tray. Klicke auf das Symbol zum Öffnen oder Beenden.",
                                    ToolTipIcon.Info
                                )
                        except Exception as ex:
                            logger.debug(f"Minimizing to tray error: {ex}")

                    def on_closing(*a):
                        try:
                            if tray:
                                tray.Visible = False
                                tray.Dispose()
                        except Exception:
                            pass

                    window.events.minimized += on_minimized
                    window.events.closing += on_closing
                    logger.info("Windows System-Tray minimieren erfolgreich aktiviert.")
                except Exception as ex:
                    logger.warning(f"Konnte System-Tray nicht initialisieren ({ex}). Standard-Minimieren aktiv.")

            webview.start(setup_tray, icon=icon_path)
            tray = tray_holder["tray"]
            if tray:
                try:
                    tray.Visible = False
                    tray.Dispose()
                except Exception:
                    pass
            if "server" in server_holder and server_holder["server"]:
                server_holder["server"].should_exit = True
            sys.exit(0)
        except Exception as e:
            logger.warning(f"Natives Desktop-Fenster nicht gestartet ({e}). Öffne Web-Browser...")

    # Fallback to standard web browser
    logger.info(f"Öffne Browser unter {app_url}...")
    webbrowser.open(app_url)

    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Beende BitAxeTool...")
        if "server" in server_holder and server_holder["server"]:
            server_holder["server"].should_exit = True
        sys.exit(0)


if __name__ == "__main__":
    main()
