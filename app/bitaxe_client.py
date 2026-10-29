"""Asynchronous, resilient HTTP client for AxeOS REST API on ESP-Miner."""

import logging
import httpx
from typing import Optional, Dict, Any, Tuple
from app.models import MinerTelemetry

logger = logging.getLogger("BitAxeTool.client")


class BitAxeClient:
    def __init__(self, ip: str, timeout: float = 3.5):
        self.ip = ip
        self.base_url = f"http://{ip}"
        self.timeout = httpx.Timeout(timeout, connect=2.0)

    async def get_system_info(self) -> Optional[Dict[str, Any]]:
        """Fetch real-time metrics and system info from /api/system/info."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{self.base_url}/api/system/info")
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.debug(f"Failed to fetch system info from {self.ip}: {e}")
        return None

    async def get_asic_settings(self) -> Optional[Dict[str, Any]]:
        """Fetch supported frequency and voltage options from /api/system/asic (AxeOS 2.0+)."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{self.base_url}/api/system/asic")
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.debug(f"/api/system/asic not supported or failed on {self.ip}: {e}")
        return None

    async def apply_tuning(self, frequency: int, voltage: int) -> Tuple[bool, str]:
        """Apply frequency and voltage parameters via PATCH /api/system."""
        payload = {
            "frequency": int(frequency),
            "coreVoltage": int(voltage)
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.patch(f"{self.base_url}/api/system", json=payload)
                if resp.status_code == 200:
                    return True, f"Applied: {frequency} MHz @ {voltage} mV"
                else:
                    return False, f"HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    async def update_system_settings(self, settings: Dict[str, Any]) -> Tuple[bool, str]:
        """Update miner system settings (pools, fallback pools, fan, display, hostname, etc.) via PATCH /api/system
        and PUT /api/system/pools/* for AxeOS 2.15+ compatibility.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 1. Update AxeOS general system settings via PATCH /api/system
                resp = await client.patch(f"{self.base_url}/api/system", json=settings)
                
                # 2. For AxeOS 2.15+, pool configurations are managed via PUT /api/system/pools/{0,1}
                has_primary = "stratumURL" in settings and "stratumPort" in settings and "stratumUser" in settings
                if has_primary and settings.get("stratumURL"):
                    p0 = {
                        "stratumURL": str(settings["stratumURL"]),
                        "stratumPort": int(settings["stratumPort"]),
                        "stratumUser": str(settings["stratumUser"]),
                    }
                    if "stratumPassword" in settings and settings["stratumPassword"]:
                        p0["password"] = settings["stratumPassword"]
                    try:
                        await client.put(f"{self.base_url}/api/system/pools/0", json=p0)
                    except Exception:
                        pass

                has_fallback = "fallbackStratumURL" in settings and "fallbackStratumPort" in settings and "fallbackStratumUser" in settings
                if has_fallback and settings.get("fallbackStratumURL"):
                    p1 = {
                        "stratumURL": str(settings["fallbackStratumURL"]),
                        "stratumPort": int(settings["fallbackStratumPort"]),
                        "stratumUser": str(settings["fallbackStratumUser"]),
                    }
                    if "fallbackStratumPassword" in settings and settings["fallbackStratumPassword"]:
                        p1["password"] = settings["fallbackStratumPassword"]
                    try:
                        await client.put(f"{self.base_url}/api/system/pools/1", json=p1)
                    except Exception:
                        pass

                if resp.status_code == 200:
                    return True, "Einstellungen erfolgreich an Miner übertragen."
                return False, f"HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            return False, f"Verbindungsfehler zu {self.ip}: {str(e)}"

    async def perform_ota_update(self, binary_data: bytes, timeout: float = 120.0) -> Tuple[bool, str]:
        """Perform an Over-The-Air (OTA) firmware flash via POST /api/system/OTA."""
        try:
            headers = {
                "Content-Type": "application/octet-stream",
                "Content-Length": str(len(binary_data))
            }
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=5.0)) as client:
                resp = await client.post(f"{self.base_url}/api/system/OTA", content=binary_data, headers=headers)
                if resp.status_code == 200:
                    return True, resp.text.strip()
                return False, f"HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            return False, f"OTA-Fehler bei {self.ip}: {str(e)}"

    async def restart(self) -> Tuple[bool, str]:
        """Reboot the Bitaxe miner cleanly via POST /api/system/restart."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}/api/system/restart")
                if resp.status_code == 200:
                    return True, "Reboot initiated successfully."
                return False, f"Reboot failed with status {resp.status_code}"
        except Exception as e:
            return False, f"Reboot request failed: {str(e)}"

    async def identify(self) -> Tuple[bool, str]:
        """Trigger physical device identification (flash display / LED)."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}/api/system/identify")
                if resp.status_code == 200:
                    return True, "Identification triggered on device."
                return False, f"Identify returned status {resp.status_code}"
        except Exception as e:
            return False, f"Identify failed: {str(e)}"
