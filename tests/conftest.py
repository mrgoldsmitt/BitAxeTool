"""Pytest configuration and test isolation fixtures."""

import os
import shutil
from unittest.mock import AsyncMock, patch
import pytest
from app import config


@pytest.fixture(autouse=True)
def protect_config_per_test():
    """Ensure tests never overwrite or modify the user's real config files."""
    backups = {}
    paths_to_protect = [
        config.CONFIG_PATH,
        config.CONFIG_BACKUP_PATH,
        config.USER_CONFIG_PATH,
        f"{config.USER_CONFIG_PATH}.bak",
    ]

    for p in paths_to_protect:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                backups[p] = f.read()

    yield

    for p in paths_to_protect:
        if p in backups:
            with open(p, "w", encoding="utf-8") as f:
                f.write(backups[p])
        elif os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass


@pytest.fixture(autouse=True)
def mock_bitaxe_client():
    """Prevent any test from sending real network packets to physical miners."""
    with patch("app.bitaxe_client.BitAxeClient.update_system_settings", new_callable=AsyncMock) as m_update, \
         patch("app.bitaxe_client.BitAxeClient.apply_tuning", new_callable=AsyncMock) as m_tune, \
         patch("app.bitaxe_client.BitAxeClient.restart", new_callable=AsyncMock) as m_restart, \
         patch("app.bitaxe_client.BitAxeClient.get_system_info", new_callable=AsyncMock) as m_info:
        m_update.return_value = (True, "Mocked OK")
        m_tune.return_value = (True, "Mocked Applied")
        m_restart.return_value = (True, "Mocked Reboot")
        m_info.return_value = {"hostname": "MockMiner", "hashRate": 1500.0, "temp": 60.0}
        yield
