"""Hardware profiles, safe frequency/voltage tiers, and default operational safeguards
for Bitaxe ASIC models (BM1366 Ultra, BM1368 Supra, BM1370 Gamma, BM1373, BM1397 Max, Hex).
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class VoltageTier(BaseModel):
    frequency: int  # in MHz
    voltage: int    # in mV
    target_hashrate: float  # in GH/s


class AsicProfile(BaseModel):
    model_name: str
    asic_model: str
    min_freq: int
    max_freq: int
    default_freq: int
    freq_step: int
    min_voltage: int
    max_voltage: int
    default_voltage: int
    voltage_step: int
    default_target_temp: float
    max_safe_temp: float
    max_safe_vr_temp: float
    default_max_watts: float
    scaling_tiers: List[VoltageTier] = Field(default_factory=list)


# BM1370 (Bitaxe Gamma 601) - Comprehensive calibrated tiers
BM1370_TIERS = [
    VoltageTier(frequency=450, voltage=1060, target_hashrate=918.0),
    VoltageTier(frequency=475, voltage=1070, target_hashrate=969.0),
    VoltageTier(frequency=500, voltage=1079, target_hashrate=1020.0),
    VoltageTier(frequency=525, voltage=1089, target_hashrate=1071.0),
    VoltageTier(frequency=550, voltage=1100, target_hashrate=1122.0),
    VoltageTier(frequency=575, voltage=1110, target_hashrate=1173.0),
    VoltageTier(frequency=600, voltage=1120, target_hashrate=1224.0),
    VoltageTier(frequency=625, voltage=1130, target_hashrate=1275.0),
    VoltageTier(frequency=650, voltage=1140, target_hashrate=1326.0),
    VoltageTier(frequency=675, voltage=1150, target_hashrate=1377.0),
    VoltageTier(frequency=700, voltage=1160, target_hashrate=1428.0),
    VoltageTier(frequency=725, voltage=1170, target_hashrate=1479.0),
    VoltageTier(frequency=750, voltage=1180, target_hashrate=1530.0),
    VoltageTier(frequency=775, voltage=1190, target_hashrate=1581.0),
    VoltageTier(frequency=800, voltage=1201, target_hashrate=1632.0),
    VoltageTier(frequency=825, voltage=1211, target_hashrate=1683.0),
    VoltageTier(frequency=850, voltage=1221, target_hashrate=1734.0),
    VoltageTier(frequency=875, voltage=1231, target_hashrate=1785.0),
    VoltageTier(frequency=900, voltage=1241, target_hashrate=1836.0),
]

# BM1366 (Bitaxe Ultra 204)
BM1366_TIERS = [
    VoltageTier(frequency=400, voltage=1100, target_hashrate=400.0),
    VoltageTier(frequency=425, voltage=1120, target_hashrate=425.0),
    VoltageTier(frequency=450, voltage=1140, target_hashrate=450.0),
    VoltageTier(frequency=475, voltage=1160, target_hashrate=475.0),
    VoltageTier(frequency=500, voltage=1180, target_hashrate=500.0),
    VoltageTier(frequency=525, voltage=1200, target_hashrate=525.0),
    VoltageTier(frequency=550, voltage=1220, target_hashrate=550.0),
    VoltageTier(frequency=575, voltage=1240, target_hashrate=575.0),
]

# BM1368 (Bitaxe Supra 401)
BM1368_TIERS = [
    VoltageTier(frequency=450, voltage=1080, target_hashrate=630.0),
    VoltageTier(frequency=475, voltage=1095, target_hashrate=665.0),
    VoltageTier(frequency=500, voltage=1110, target_hashrate=700.0),
    VoltageTier(frequency=525, voltage=1125, target_hashrate=735.0),
    VoltageTier(frequency=550, voltage=1140, target_hashrate=770.0),
    VoltageTier(frequency=575, voltage=1155, target_hashrate=805.0),
    VoltageTier(frequency=600, voltage=1170, target_hashrate=840.0),
    VoltageTier(frequency=625, voltage=1185, target_hashrate=875.0),
    VoltageTier(frequency=650, voltage=1200, target_hashrate=910.0),
]

PROFILES: Dict[str, AsicProfile] = {
    "BM1370": AsicProfile(
        model_name="Bitaxe Gamma 601",
        asic_model="BM1370",
        min_freq=450,
        max_freq=750,
        default_freq=525,
        freq_step=25,
        min_voltage=1060,
        max_voltage=1220,
        default_voltage=1100,
        voltage_step=10,
        default_target_temp=62.0,
        max_safe_temp=70.0,
        max_safe_vr_temp=88.0,
        default_max_watts=26.0,
        scaling_tiers=BM1370_TIERS,
    ),
    "BM1366": AsicProfile(
        model_name="Bitaxe Ultra 204",
        asic_model="BM1366",
        min_freq=400,
        max_freq=575,
        default_freq=475,
        freq_step=25,
        min_voltage=1100,
        max_voltage=1240,
        default_voltage=1160,
        voltage_step=15,
        default_target_temp=62.0,
        max_safe_temp=70.0,
        max_safe_vr_temp=85.0,
        default_max_watts=18.0,
        scaling_tiers=BM1366_TIERS,
    ),
    "BM1368": AsicProfile(
        model_name="Bitaxe Supra 401",
        asic_model="BM1368",
        min_freq=450,
        max_freq=650,
        default_freq=525,
        freq_step=25,
        min_voltage=1080,
        max_voltage=1220,
        default_voltage=1125,
        voltage_step=10,
        default_target_temp=62.0,
        max_safe_temp=70.0,
        max_safe_vr_temp=88.0,
        default_max_watts=22.0,
        scaling_tiers=BM1368_TIERS,
    ),
    "BM1397": AsicProfile(
        model_name="Bitaxe Max / 1397",
        asic_model="BM1397",
        min_freq=400,
        max_freq=550,
        default_freq=450,
        freq_step=25,
        min_voltage=1100,
        max_voltage=1250,
        default_voltage=1150,
        voltage_step=15,
        default_target_temp=62.0,
        max_safe_temp=70.0,
        max_safe_vr_temp=85.0,
        default_max_watts=18.0,
        scaling_tiers=[
            VoltageTier(frequency=400, voltage=1100, target_hashrate=350.0),
            VoltageTier(frequency=450, voltage=1150, target_hashrate=400.0),
            VoltageTier(frequency=500, voltage=1200, target_hashrate=450.0),
        ],
    ),
}

# Generic fallback profile for unknown or unlisted models
GENERIC_PROFILE = AsicProfile(
    model_name="Generic Bitaxe",
    asic_model="Generic",
    min_freq=400,
    max_freq=650,
    default_freq=500,
    freq_step=25,
    min_voltage=1060,
    max_voltage=1220,
    default_voltage=1120,
    voltage_step=10,
    default_target_temp=62.0,
    max_safe_temp=70.0,
    max_safe_vr_temp=88.0,
    default_max_watts=24.0,
    scaling_tiers=BM1370_TIERS,
)


def get_profile_for_model(model_str: Optional[str]) -> AsicProfile:
    """Find the best matching AsicProfile based on reported ASICModel or board name."""
    if not model_str:
        return GENERIC_PROFILE
    clean = model_str.upper().strip()
    for key, profile in PROFILES.items():
        if key in clean or profile.model_name.upper() in clean:
            return profile
    # Common aliases
    if "GAMMA" in clean or "601" in clean:
        return PROFILES["BM1370"]
    if "ULTRA" in clean or "204" in clean:
        return PROFILES["BM1366"]
    if "SUPRA" in clean or "401" in clean:
        return PROFILES["BM1368"]
    if "MAX" in clean:
        return PROFILES["BM1397"]
    return GENERIC_PROFILE


def find_safe_voltage_for_freq(freq: int, tiers: List[VoltageTier], default_voltage: int = 1100) -> int:
    """Look up interpolated safe voltage for a given frequency from the tier list."""
    if not tiers:
        return default_voltage
    sorted_tiers = sorted(tiers, key=lambda t: t.frequency)
    if freq <= sorted_tiers[0].frequency:
        return sorted_tiers[0].voltage
    if freq >= sorted_tiers[-1].frequency:
        return sorted_tiers[-1].voltage

    # Find closest or interpolate
    for i in range(len(sorted_tiers) - 1):
        t1 = sorted_tiers[i]
        t2 = sorted_tiers[i + 1]
        if t1.frequency <= freq <= t2.frequency:
            ratio = (freq - t1.frequency) / (t2.frequency - t1.frequency)
            return int(t1.voltage + ratio * (t2.voltage - t1.voltage))
    return default_voltage
