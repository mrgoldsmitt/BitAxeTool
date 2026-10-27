"""Unit tests for BitAxeTool governor, hardware profiles, config, and safety logic."""

import time
import pytest
from app.hardware_profiles import (
    get_profile_for_model, find_safe_voltage_for_freq, BM1370_TIERS, BM1366_TIERS
)
from app.models import MinerConfig, MinerTelemetry, LogEntry
from app.tuner import MinerWorker
from app.config import get_or_create_miner_config


def test_hardware_profiles_matching():
    """Verify that model strings correctly resolve to known ASIC profiles."""
    p_gamma = get_profile_for_model("BM1370")
    assert p_gamma.asic_model == "BM1370"
    assert p_gamma.default_freq == 525

    p_ultra = get_profile_for_model("Bitaxe Ultra 204")
    assert p_ultra.asic_model == "BM1366"

    p_supra = get_profile_for_model("BM1368")
    assert p_supra.asic_model == "BM1368"

    p_generic = get_profile_for_model("NonExistentModel")
    assert p_generic.asic_model == "Generic"


def test_find_safe_voltage_interpolation():
    """Verify interpolated voltage values across frequency steps."""
    # Exact tier match
    volt_500 = find_safe_voltage_for_freq(500, BM1370_TIERS)
    assert volt_500 == 1079

    # Above max frequency clamps to max tier
    volt_high = find_safe_voltage_for_freq(1000, BM1370_TIERS)
    assert volt_high == BM1370_TIERS[-1].voltage

    # Below min frequency clamps to min tier
    volt_low = find_safe_voltage_for_freq(300, BM1370_TIERS)
    assert volt_low == BM1370_TIERS[0].voltage


def test_miner_config_defaults():
    """Verify calibrated default config generation."""
    cfg = get_or_create_miner_config("192.168.1.100", model="BM1370", nickname="TestGamma")
    assert cfg.ip == "192.168.1.100"
    assert cfg.nickname == "TestGamma"
    assert cfg.target_temp == 62.0
    assert cfg.max_temp == 72.0
    assert cfg.max_vr_temp == 88.0
    assert cfg.min_freq == 450
    assert cfg.max_freq == 950


@pytest.mark.asyncio
async def test_governor_emergency_throttle():
    """Verify that an over-temperature condition triggers immediate throttle down."""
    cfg = MinerConfig(
        ip="127.0.0.1",
        target_temp=62.0,
        temp_tolerance=2.0,
        max_temp=68.0,
        min_freq=450,
        max_freq=650,
        freq_step=25,
        min_voltage=1060,
        max_voltage=1200
    )

    logs = []
    worker = MinerWorker(cfg, log_callback=lambda l: logs.append(l))

    # Mock current telemetry with overheating
    now = time.time()
    info = {
        "temp": 71.5,  # Exceeds max_temp (68.0)
        "vrTemp": 72.0,
        "power": 18.0,
        "frequency": 600,
        "coreVoltage": 1120,
        "hashRate": 1200.0,
        "sharesAccepted": 100,
        "sharesRejected": 0
    }
    worker._update_telemetry(info, now)
    await worker._evaluate_governor(now)

    assert worker.telemetry.governor_status == "EMERGENCY_THROTTLE"
    assert "Temperatur" in worker.telemetry.governor_message or "Drosselung" in worker.telemetry.governor_message


@pytest.mark.asyncio
async def test_governor_sweet_spot():
    """Verify that temperatures inside the tolerance band are held at OPTIMAL."""
    cfg = MinerConfig(
        ip="127.0.0.1",
        target_temp=58.0,
        temp_tolerance=2.0,  # Band is 56.0 - 58.0
        max_temp=65.0,
        min_freq=450,
        max_freq=650
    )

    worker = MinerWorker(cfg, log_callback=lambda l: None)
    now = time.time()
    info = {
        "temp": 57.2,  # Inside 56.0 - 58.0
        "vrTemp": 65.0,
        "power": 16.0,
        "frequency": 550,
        "coreVoltage": 1100,
        "hashRate": 1120.0
    }
    worker._update_telemetry(info, now)
    await worker._evaluate_governor(now)

    assert worker.telemetry.governor_status == "OPTIMAL"


@pytest.mark.asyncio
async def test_governor_headroom_cooldown():
    """Verify that thermal headroom respects the tuning cooldown timer."""
    cfg = MinerConfig(
        ip="127.0.0.1",
        target_temp=58.0,
        temp_tolerance=2.0,
        max_temp=65.0,
        tuning_cooldown=30
    )

    worker = MinerWorker(cfg, log_callback=lambda l: None)
    now = time.time()
    worker._last_tune_time = now - 10  # Only 10 seconds ago, cooldown is 30s

    info = {
        "temp": 50.0,  # Well below target
        "vrTemp": 55.0,
        "power": 15.0,
        "frequency": 500,
        "coreVoltage": 1080,
        "hashRate": 1020.0
    }
    worker._update_telemetry(info, now)
    await worker._evaluate_governor(now)

    # Should be stabilizing, not ramping up yet
    assert worker.telemetry.governor_status == "STABILIZING"
