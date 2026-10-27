"""BitAxeTool - Root entrypoint with automatic virtual environment & dependency resolver."""

import os
import sys
import subprocess

# Ensure the project root directory is at the beginning of sys.path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def ensure_environment():
    """Verify that required dependencies (uvicorn, fastapi, etc.) are available.
    If not, attempts to re-exec within .venv or install requirements automatically.
    """
    try:
        import uvicorn
        import fastapi
        return
    except (ImportError, ModuleNotFoundError):
        pass

    # Look for a local virtual environment in .venv
    is_win = sys.platform.startswith("win")
    venv_python = (
        os.path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe")
        if is_win
        else os.path.join(PROJECT_ROOT, ".venv", "bin", "python")
    )

    # 1. If a valid .venv python exists and isn't the current interpreter, re-exec into it
    if os.path.exists(venv_python) and os.path.abspath(sys.executable).lower() != os.path.abspath(venv_python).lower():
        print(f"[*] Switching to virtual environment: {venv_python}")
        os.execv(venv_python, [venv_python] + sys.argv)

    # 2. If running inside an environment that just needs packages installed
    req_file = os.path.join(PROJECT_ROOT, "requirements.txt")
    if os.path.exists(req_file):
        print("[*] Required packages are missing. Installing now...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--prefer-binary", "-r", req_file])
            print("[*] Installation successful! Starting application...\n")
            return
        except Exception:
            # Fallback to direct core packages without C++ build dependencies
            try:
                subprocess.check_call([
                    sys.executable, "-m", "pip", "install", "--prefer-binary",
                    "fastapi", "uvicorn", "websockets", "httpx", "pydantic", "zeroconf", "qrcode"
                ])
                print("[*] Core packages installed successfully! Starting application...\n")
                return
            except Exception as e:
                print(f"[!] Automatic package installation failed: {e}")

    print("\n[FEHLER] Die erforderlichen Python-Pakete (z.B. uvicorn) sind noch nicht installiert.")
    print("Bitte starte das Programm ueber 'Run_BitAxeTool.bat' oder fuehre folgenden Befehl aus:")
    print("   pip install -r requirements.txt\n")
    sys.exit(1)


if __name__ == "__main__":
    ensure_environment()
    from app.main import main
    main()
