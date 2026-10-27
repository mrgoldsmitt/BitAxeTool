"""Data structures, schemas, and Pydantic models for Bitaxe configuration and telemetry."""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class MinerConfig(BaseModel):
    ip: str
    nickname: str = ""
    hostname: Optional[str] = None
    model: str = "Unknown"
    asic_model: str = "BM1370"
    enabled: bool = True

    # Thermal & Power Parameters (Calibrated for real-world safe headroom)
    target_temp: float = 62.0         # Balanced target temperature (°C)
    temp_tolerance: float = 2.0       # Symmetrical deadband (±2.0°C)
    max_temp: float = 70.0            # Hard thermal limit before emergency throttle (°C)
    max_vr_temp: float = 88.0         # Voltage regulator maximum safe temperature (°C)
    max_watts: float = 26.0           # Maximum power draw (Watts)

    # Clock & Voltage Parameters
    min_freq: int = 450
    max_freq: int = 750
    freq_step: int = 25
    min_voltage: int = 1060
    max_voltage: int = 1220
    voltage_step: int = 10

    # Stabilization & Watchdogs
    monitor_interval: int = 4         # Telemetry poll interval in seconds
    tuning_cooldown: int = 25         # Stabilization cooldown after clock change in seconds
    flatline_watchdog: bool = True    # Auto-reboot on dead/frozen hashrate (0 GH/s)
    flatline_cycles: int = 6          # Number of consecutive 0 GH/s readings to trigger reboot
    enforce_safe_tiers: bool = True   # Follow calibrated voltage-frequency pairing curve


class MinerTelemetry(BaseModel):
    ip: str
    connected: bool = False
    last_seen: float = 0.0

    # Core Metrics
    temp: Optional[float] = None
    vr_temp: Optional[float] = None
    hash_rate: Optional[float] = None          # GH/s
    expected_hash_rate: Optional[float] = None  # GH/s
    power: Optional[float] = None              # Watts
    frequency: Optional[int] = None            # MHz
    voltage: Optional[int] = None              # mV
    fanspeed: Optional[float] = None           # %
    fanrpm: Optional[int] = None
    efficiency_j_th: Optional[float] = None    # Joules / Terahash (W / (GH/s / 1000))

    # Health & Error metrics
    shares_accepted: Optional[int] = 0
    shares_rejected: Optional[int] = 0
    error_percentage: Optional[float] = 0.0
    uptime_seconds: Optional[int] = 0
    overheat_mode: Optional[int] = 0

    # Governor state
    governor_status: str = "IDLE"   # "OPTIMAL", "RAMPING_UP", "COOLING_DOWN", "EMERGENCY_THROTTLE", "STABILIZING", "OFFLINE"
    governor_message: str = "Warte auf erste Messung..."
    last_tuned_at: float = 0.0

    # Hardware capability options detected from /api/system/asic
    frequency_options: List[int] = Field(default_factory=list)
    voltage_options: List[int] = Field(default_factory=list)


class AppConfig(BaseModel):
    web_port: int = 21420
    host: str = "0.0.0.0"
    auto_scan_on_startup: bool = True
    default_scan_range: str = ""
    miners: List[MinerConfig] = Field(default_factory=list)


class LogEntry(BaseModel):
    timestamp: str
    level: str  # "info", "success", "warning", "error", "telemetry"
    miner_ip: Optional[str] = None
    message: str


class ManualTuneRequest(BaseModel):
    frequency: int
    voltage: int


class ScanRequest(BaseModel):
    subnet: Optional[str] = None  # e.g. "192.168.1.0/24" or empty for auto-detect
