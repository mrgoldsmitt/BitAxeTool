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
