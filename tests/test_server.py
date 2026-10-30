"""Integration tests for FastAPI REST API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.server import app
from app.models import AppConfig

client = TestClient(app)


def test_api_network_info():
    """Verify network info endpoint returns proper LAN metadata."""
    res = client.get("/api/network-info")
    assert res.status_code == 200
    data = res.json()
    assert "local_ip" in data
    assert "lan_url" in data
    assert "port" in data


def test_api_get_miners_and_config():
    """Verify reading configuration and miners list."""
    res = client.get("/api/miners")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    cfg_res = client.get("/api/config")
    assert cfg_res.status_code == 200
    cfg = cfg_res.json()
    assert "web_port" in cfg


def test_api_add_and_remove_miner():
    """Test adding and removing a miner via REST API."""
    test_ip = "192.168.1.250"
    
    # Clean up if pre-existing
    client.delete(f"/api/miners/{test_ip}")

    # Add miner
    add_res = client.post("/api/miners", json={
        "ip": test_ip,
        "nickname": "Test Miner 250",
        "model": "Bitaxe Gamma 601 (BM1370)",
        "target_temp": 56.5
    })
    assert add_res.status_code == 200
    miner = add_res.json()
    assert miner["ip"] == test_ip
    assert miner["target_temp"] == 56.5

    # Update miner with pool settings and apply_to_same_model
    put_res = client.put(f"/api/miners/{test_ip}", json={
        "target_temp": 59.0,
        "stratumURL": "solo.ckpool.org",
        "stratumPort": 3333,
        "stratumUser": "bc1qtest123",
        "alarm_enabled": False,
        "alarm_temp_threshold": 74.0,
        "alarm_vr_threshold": 87.0,
        "alarm_offline": False,
        "alarm_reboot": True,
        "apply_to_same_model": True
    })
    assert put_res.status_code == 200
    assert put_res.json()["target_temp"] == 59.0
    assert put_res.json()["stratum_url"] == "solo.ckpool.org"
    assert put_res.json()["stratum_port"] == 3333
    assert put_res.json()["alarm_enabled"] is False
    assert put_res.json()["alarm_temp_threshold"] == 74.0
    assert put_res.json()["alarm_vr_threshold"] == 87.0
    assert put_res.json()["alarm_offline"] is False
    assert put_res.json()["alarm_reboot"] is True

    # Delete miner
    del_res = client.delete(f"/api/miners/{test_ip}")
    assert del_res.status_code == 200


def test_api_qrcode_generation():
    """Verify QR code generation for mobile devices."""
    res = client.get("/api/qrcode")
    assert res.status_code == 200
    assert res.headers["content-type"] in ("image/svg+xml", "image/png")
    assert len(res.content) > 100


def test_api_version_and_changelog():
    """Verify version endpoint, metadata, changelog and license retrieval."""
    ver_res = client.get("/api/version")
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    assert ver_data["version"] == "2.3.6"
    assert ver_data["appName"] == "BitAxeTool"
    assert ver_data["author"] == "mrgoldsmitt"
    assert ver_data["website"] == "https://mrgoldsmitt.work"
    assert "CC BY-NC 4.0" in ver_data["license"]

    cl_res = client.get("/api/changelog")
    assert cl_res.status_code == 200
    assert "2.3.6" in cl_res.text
    assert "mrgoldsmitt" in cl_res.text

    lic_res = client.get("/api/license")
    assert lic_res.status_code == 200
    assert "Creative Commons" in lic_res.text
    assert "mrgoldsmitt" in lic_res.text


def test_api_logs_download_and_clear():
    """Verify log file download and log reset endpoints."""
    dl_res = client.get("/api/logs/download")
    assert dl_res.status_code == 200

    clear_res = client.post("/api/logs/clear")
    assert clear_res.status_code == 200
    assert clear_res.json()["status"] == "success"


def test_api_ota_endpoints(monkeypatch):
    """Verify OTA firmware update endpoints (latest metadata and upload)."""
    # 1. Test latest version check
    res = client.get("/api/ota/latest")
    assert res.status_code == 200
    assert "success" in res.json()

    # 2. Test binary upload validation (too small)
    small_upload = client.post("/api/ota/upload?target_ip=192.168.188.197&filename=esp-miner.bin", content=b"short")
    assert small_upload.status_code == 400

    # 3. Test binary upload with mock valid binary (> 100 KB)
    dummy_bin = b"X" * (120 * 1024)
    upload_res = client.post(
        "/api/ota/upload?target_ip=192.168.188.197&filename=esp-miner.bin",
        content=dummy_bin,
        headers={"Content-Type": "application/octet-stream"}
    )
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["status"] == "complete"
    assert len(data["results"]) == 1
    assert data["results"][0]["success"] is True


def test_api_manual_tune_and_stop(monkeypatch):
    """Verify manual tuning test mode and premature stop endpoints."""
    from app.bitaxe_client import BitAxeClient

    async def mock_apply(self, frequency, voltage):
        return True, f"Mock Applied: {frequency} MHz @ {voltage} mV"

    monkeypatch.setattr(BitAxeClient, "apply_tuning", mock_apply)

    test_ip = "192.168.1.188"
    # Ensure miner is registered
    client.post("/api/miners", json={
        "ip": test_ip,
        "nickname": "Test Tune Miner",
        "model": "Bitaxe Gamma 601 (BM1370)"
    })

    # Start timed test for 8 minutes
    tune_res = client.post(f"/api/miner/{test_ip}/tune", json={
        "frequency": 600,
        "voltage": 1160,
        "duration_minutes": 8
    })
    assert tune_res.status_code == 200
    t_data = tune_res.json()
    assert t_data["success"] is True
    assert t_data["duration_minutes"] == 8

    # Stop test early
    stop_res = client.post(f"/api/miner/{test_ip}/tune/stop")
    assert stop_res.status_code == 200
    s_data = stop_res.json()
    assert s_data["success"] is True

    # Clean up
    client.delete(f"/api/miners/{test_ip}")
