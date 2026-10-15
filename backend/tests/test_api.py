import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import sys
import os

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app

client = TestClient(app)

def test_root_endpoint():
    """Verify backend operational status and metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["project"] == "Cavite Agri-Watch"
    assert data["status"] == "Operational"
    assert "phase" in data

def test_cors_headers():
    """Verify CORS headers allow cross-origin requests from frontend."""
    response = client.options(
        "/",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "*"

def test_test_gee_endpoint():
    """Verify /test-gee endpoint returns status and model availability."""
    response = client.get("/test-gee")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_ready" in data
    assert "paper_models" in data

def test_cvip_evidence_metadata():
    """Verify CVIP evidence endpoint returns expected metadata structure."""
    response = client.get("/cvip/evidence")
    assert response.status_code == 200
    data = response.json()
    assert "metadata" in data
    metadata = data["metadata"]
    assert "temporal" in metadata
    assert "spectral" in metadata
    assert "spatial" in metadata

def test_validation_evidence_structure():
    """Verify offline validation artifacts endpoint responds."""
    response = client.get("/validation/evidence")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
