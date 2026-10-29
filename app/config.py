"""Thread-safe and atomic configuration management for BitAxeTool."""

import json
import os
import shutil
import logging
from typing import Optional, List, Dict
from app.models import AppConfig, MinerConfig
from app.hardware_profiles import get_profile_for_model

logger = logging.getLogger("BitAxeTool.config")

def _get_base_dir() -> str:
    import sys
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

BASE_DIR = _get_base_dir()
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
CONFIG_BACKUP_PATH = os.path.join(BASE_DIR, "config.json.bak")
USER_CONFIG_PATH = os.path.join(BASE_DIR, "config.user.json")


def get_active_config_path() -> str:
    """Return user override config path if present, otherwise default config path."""
    if os.path.exists(USER_CONFIG_PATH):
        return USER_CONFIG_PATH
    return CONFIG_PATH


def load_config() -> AppConfig:
    """Load configuration from disk. Recovers from backup if main file is corrupted."""
    cfg_file = get_active_config_path()
    if not os.path.exists(cfg_file):
        default_cfg = AppConfig()
        save_config(default_cfg)
        return default_cfg

    try:
        with open(cfg_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return AppConfig(**data)
    except Exception as e:
        logger.warning(f"Error parsing {cfg_file} ({e}). Checking backup...")
        if os.path.exists(CONFIG_BACKUP_PATH):
            try:
                with open(CONFIG_BACKUP_PATH, "r", encoding="utf-8") as bf:
                    data = json.load(bf)
                    return AppConfig(**data)
            except Exception as be:
                logger.error(f"Backup config also failed ({be}). Falling back to defaults.")

        default_cfg = AppConfig()
        save_config(default_cfg)
        return default_cfg


def save_config(config: AppConfig) -> bool:
    """Atomically save configuration to disk with backup creation."""
    try:
        cfg_file = get_active_config_path()
        backup_file = f"{cfg_file}.bak"
        # Create backup if original exists
        if os.path.exists(cfg_file):
            try:
                shutil.copy2(cfg_file, backup_file)
            except Exception:
                pass

        temp_path = f"{cfg_file}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(config.model_dump_json(indent=2))

        # Atomic replace
        os.replace(temp_path, cfg_file)
        return True
    except Exception as e:
        logger.error(f"Failed to save configuration: {e}")
        return False


def get_or_create_miner_config(ip: str, model: str = "Unknown", nickname: str = "") -> MinerConfig:
    """Generate default MinerConfig calibrated for the specific ASIC model."""
    profile = get_profile_for_model(model)
    return MinerConfig(
        ip=ip,
        nickname=nickname or f"Bitaxe-{ip.split('.')[-1]}",
        model=profile.model_name,
        asic_model=profile.asic_model,
        enabled=True,
        target_temp=profile.default_target_temp,
        temp_tolerance=2.0,
        max_temp=profile.max_safe_temp,
        max_vr_temp=profile.max_safe_vr_temp,
        max_watts=profile.default_max_watts,
        min_freq=profile.min_freq,
        max_freq=profile.max_freq,
        freq_step=profile.freq_step,
        min_voltage=profile.min_voltage,
        max_voltage=profile.max_voltage,
        voltage_step=profile.voltage_step,
        monitor_interval=4,
        tuning_cooldown=30,
        flatline_watchdog=True,
        enforce_safe_tiers=True,
        alarm_enabled=True,
        alarm_temp_threshold=profile.max_safe_temp,
        alarm_vr_threshold=profile.max_safe_vr_temp - 2.0,
        alarm_offline=True,
        alarm_reboot=True
    )
