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
    assert volt_500 == 1140

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
    assert cfg.max_temp == 95.0
    assert cfg.max_vr_temp == 110.0
    assert cfg.min_freq == 350
    assert cfg.max_freq == 2500
    assert cfg.alarm_enabled is True
    assert cfg.alarm_temp_threshold == 95.0
    assert cfg.alarm_offline is True


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
async def test_governor_power_throttle():
    """Verify that power limit triggers POWER_THROTTLE without triggering thermal emergency."""
    cfg = MinerConfig(
        ip="127.0.0.1",
        target_temp=66.0,
        temp_tolerance=2.0,
        max_temp=72.0,
        max_watts=28.0,
        min_freq=450,
        max_freq=775,
        freq_step=25,
        min_voltage=1060,
        max_voltage=1200
    )
    worker = MinerWorker(cfg, log_callback=lambda l: None)
    now = time.time()
    info = {
        "temp": 58.0,  # 58.0°C is completely safe!
        "vrTemp": 54.0,
        "power": 28.6,  # Exceeds max_watts (28.0)
        "frequency": 775,
        "coreVoltage": 1190,
        "hashRate": 1500.0
    }
    worker._update_telemetry(info, now)
    await worker._evaluate_governor(now)

    assert worker.telemetry.governor_status == "POWER_THROTTLE"
    assert "Leistungs-Drosselung" in worker.telemetry.governor_message


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


@pytest.mark.asyncio
async def test_timed_manual_test_mode():
    """Verify that manual tuning test mode holds parameters and reverts after timer expires or on stop."""
    cfg = MinerConfig(
        ip="127.0.0.1",
        target_temp=58.0,
        temp_tolerance=2.0,
        max_temp=72.0,
        min_freq=450,
        max_freq=750,
        min_voltage=1140,
        max_voltage=1250,
        tuning_cooldown=30
    )

    worker = MinerWorker(cfg, log_callback=lambda l: None)
    now = time.time()

    # Normal telemetry
    info = {
        "temp": 48.0,  # Below target, governor would normally ramp up
        "vrTemp": 42.0,
        "power": 16.0,
        "frequency": 550,
        "coreVoltage": 1150,
        "hashRate": 1120.0
    }
    worker._update_telemetry(info, now)

    # 1. Start a 5-minute test at 600 MHz @ 1170 mV
    worker.start_manual_test(frequency=600, voltage=1170, duration_minutes=5)
    assert worker._test_mode is True
    assert worker.telemetry.test_mode is True
    assert worker.telemetry.test_freq == 600
    assert worker.telemetry.test_volt == 1170
    assert worker.telemetry.governor_status == "TEST_MODE"

    # Evaluate at 2 minutes into the test -> should stay in TEST_MODE
    await worker._evaluate_governor(now + 120.0)
    assert worker._test_mode is True
    assert worker.telemetry.test_mode is True
    assert worker.telemetry.governor_status == "TEST_MODE"
    assert worker.telemetry.test_remaining_seconds == 180  # 300 - 120

    # Evaluate at 6 minutes (after expiration) -> should expire and return to autotuner
    await worker._evaluate_governor(now + 360.0)
    assert worker._test_mode is False
    assert worker.telemetry.test_mode is False
    assert worker.telemetry.governor_status == "STABILIZING"

    # 2. Test manual button stop
    worker.start_manual_test(frequency=625, voltage=1170, duration_minutes=10)
    assert worker._test_mode is True
    worker.stop_manual_test()
    assert worker._test_mode is False
    assert worker.telemetry.test_mode is False
    assert worker.telemetry.governor_status == "STABILIZING"


@pytest.mark.asyncio
async def test_governor_active_ramp_up_headroom():
    """Verify that when temp is below the sweet spot and power/clock headroom exists, governor ramps up."""
    cfg = MinerConfig(
        ip="192.168.188.197",
        target_temp=66.0,
        temp_tolerance=2.0,
        max_temp=75.0,
        max_watts=35.0,
        min_freq=525,
        max_freq=900,
        freq_step=25,
        tuning_cooldown=30
    )
    worker = MinerWorker(cfg, log_callback=lambda l: None)
    now = time.time()
    worker._last_tune_time = now - 40.0  # Cooldown elapsed

    # Satoshi scenario: 64.2°C (< 65.0°C), 26.8W (< 33.5W), 775 MHz (< 900 MHz)
    info = {
        "temp": 64.2,
        "vrTemp": 62.0,
        "power": 26.8,
        "frequency": 775,
        "coreVoltage": 1180,
        "hashRate": 1600.0
    }
    worker._update_telemetry(info, now)
    await worker._evaluate_governor(now)

    # Must ramp up towards max_freq
    assert worker.telemetry.governor_status == "RAMPING_UP"
    assert worker.telemetry.frequency > 775
