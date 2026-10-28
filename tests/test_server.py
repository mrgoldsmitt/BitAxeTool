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
        "apply_to_same_model": True
    })
    assert put_res.status_code == 200
    assert put_res.json()["target_temp"] == 59.0
    assert put_res.json()["stratum_url"] == "solo.ckpool.org"
    assert put_res.json()["stratum_port"] == 3333

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
    assert ver_data["version"] == "2.3.3"
    assert ver_data["appName"] == "BitAxeTool"
    assert ver_data["author"] == "mrgoldsmitt"
    assert ver_data["website"] == "https://mrgoldsmitt.work"
    assert "CC BY-NC 4.0" in ver_data["license"]

    cl_res = client.get("/api/changelog")
    assert cl_res.status_code == 200
    assert "2.3.3" in cl_res.text
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
