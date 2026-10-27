"""High-speed asynchronous subnet scanner and mDNS Zeroconf discovery for Bitaxe miners."""

import asyncio
import socket
import logging
import ipaddress
import httpx
from typing import List, Dict, Any, Optional
from zeroconf import Zeroconf, ServiceBrowser, ServiceListener

logger = logging.getLogger("BitAxeTool.scanner")


def get_local_ip_and_subnet() -> str:
    """Detect primary local IPv4 address and return standard /24 subnet string."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Doesn't need to actually send traffic
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        # Create standard /24 network
        ip_net = ipaddress.IPv4Network(f"{local_ip}/24", strict=False)
        return str(ip_net)
    except Exception as e:
        logger.warning(f"Could not automatically detect local subnet ({e}). Defaulting to 192.168.1.0/24")
        return "192.168.1.0/24"


class BitAxeDiscoveryListener(ServiceListener):
    """mDNS Service Listener for Zeroconf discovery of AxeOS / ESP-Miner devices."""
    def __init__(self):
        self.found_ips = set()

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        try:
            info = zc.get_service_info(type_, name)
            if info and info.parsed_addresses():
                for addr in info.parsed_addresses():
                    self.found_ips.add(addr)
                    logger.info(f"mDNS discovered service {name} at {addr}")
        except Exception as e:
            logger.debug(f"Error parsing mDNS service {name}: {e}")

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        pass

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        pass


async def probe_ip(ip: str, client: httpx.AsyncClient, semaphore: asyncio.Semaphore) -> Optional[Dict[str, Any]]:
    """Probe a single IP address to verify if an AxeOS HTTP API is active."""
    url = f"http://{ip}/api/system/info"
    async with semaphore:
        try:
            resp = await client.get(url, timeout=httpx.Timeout(1.2, connect=0.8))
            if resp.status_code == 200:
                data = resp.json()
                # Check for characteristic AxeOS / ESP-Miner keys
                if any(k in data for k in ("ASICModel", "boardVersion", "smallCoreCount", "axeOSVersion")):
                    logger.info(f"Discovered Bitaxe at {ip}: {data.get('ASICModel')} (Host: {data.get('hostname')})")
                    return {
                        "ip": ip,
                        "hostname": data.get("hostname", f"bitaxe-{ip.split('.')[-1]}"),
                        "model": data.get("ASICModel", "Unknown Bitaxe"),
                        "board_version": data.get("boardVersion", "Unknown"),
                        "axeos_version": data.get("axeOSVersion", data.get("version", "AxeOS")),
                        "frequency": data.get("frequency"),
                        "voltage": data.get("coreVoltage"),
                        "temp": data.get("temp"),
                        "hash_rate": data.get("hashRate"),
                        "power": data.get("power"),
                    }
        except Exception:
            pass
    return None


async def scan_network(subnet_cidr: Optional[str] = None, concurrency: int = 50) -> List[Dict[str, Any]]:
    """Scan the entire subnet concurrently in parallel. Probes all 254 IPs in ~1.5 seconds."""
    if not subnet_cidr or not subnet_cidr.strip():
        subnet_cidr = get_local_ip_and_subnet()

    try:
        network = ipaddress.IPv4Network(subnet_cidr, strict=False)
    except Exception as e:
        logger.error(f"Invalid subnet provided ({subnet_cidr}): {e}")
        network = ipaddress.IPv4Network(get_local_ip_and_subnet(), strict=False)

    ips_to_scan = [str(ip) for ip in network.hosts()]
    logger.info(f"Starting concurrent scan of {len(ips_to_scan)} IP addresses on {network}...")

    # Also perform a quick mDNS sweep in parallel
    mdns_ips = set()
    try:
        zc = Zeroconf()
        listener = BitAxeDiscoveryListener()
        browser = ServiceBrowser(zc, ["_http._tcp.local.", "_axeos._sub._http._tcp.local."], listener)
        # Allow Zeroconf to collect multicast replies
        await asyncio.sleep(0.6)
        mdns_ips = listener.found_ips
        zc.close()
    except Exception as e:
        logger.debug(f"mDNS scan error: {e}")

    # Prioritize any mDNS found IPs and scan all hosts concurrently
    all_ips = list(mdns_ips.union(set(ips_to_scan)))

    semaphore = asyncio.Semaphore(concurrency)
    limits = httpx.Limits(max_keepalive_connections=50, max_connections=100)

    async with httpx.AsyncClient(limits=limits) as client:
        tasks = [probe_ip(ip, client, semaphore) for ip in all_ips]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    discovered = [r for r in results if isinstance(r, dict) and r is not None]
    logger.info(f"Scan completed: found {len(discovered)} Bitaxe miner(s).")
    return discovered
