"""
test_telemetry_cache.py — Verification & Benchmark Suite for the SE2 TTL Cache-Aside Decorator.

Implements TC-01 through TC-08 covering functional correctness, key normalization,
100% deep JSON payload equivalence, TTL expiration, manual invalidation, 100-request
hotspot latency benchmarking across 8 Cavite municipalities, and peak heap memory
boundedness via tracemalloc.
"""

from __future__ import annotations

import hashlib
import json
import os
import statistics
import sys
import time
import tracemalloc
from typing import Dict

import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is importable regardless of working directory
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import main as backend_main
from telemetry_cache import (
    CachedTelemetryDecorator,
    CacheMetrics,
    TelemetryProvider,
    UncachedTelemetryService,
)

HOTSPOT_MUNICIPALITIES = [
    "General Trias",
    "Naic",
    "Tanza",
    "Maragondon",
    "Silang",
    "Indang",
    "Alfonso",
    "Magallanes",
]


def _make_deterministic_payload(municipality: str, window: str) -> Dict[str, object]:
    """Build a deterministic, realistic Cavite Agri-Watch telemetry & forecast payload."""
    norm_city = municipality.strip().lower()
    norm_window = window.strip().lower()
    digest = hashlib.sha256(f"{norm_city}:{norm_window}".encode("utf-8")).digest()
    seed = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF

    ndvi = round(0.28 + seed * 0.44, 4)
    evi = round(max(0.05, ndvi * 0.82), 4)
    ndwi = round(-0.45 + seed * 0.35, 4)
    lswi = round(0.05 + seed * 0.25, 4)
    ndre = round(0.10 + seed * 0.18, 4)
    forecast_30d = round(min(0.95, max(0.10, ndvi - 0.015)), 4)

    if forecast_30d >= 0.60:
        risk_tier = "No Stress"
    elif forecast_30d >= 0.45:
        risk_tier = "Mild Stress"
    elif forecast_30d >= 0.30:
        risk_tier = "Moderate Stress"
    else:
        risk_tier = "Severe Stress"

    confidence_score = round(0.84 + seed * 0.14, 4)

    return {
        "status": "Success",
        "municipality": norm_city,
        "window": norm_window,
        "NDVI": ndvi,
        "EVI": evi,
        "NDWI": ndwi,
        "LSWI": lswi,
        "NDRE": ndre,
        "forecast_ndvi_30d": forecast_30d,
        "risk_tier": risk_tier,
        "confidence_score": confidence_score,
        "advisory": {
            "routines": [
                "Morning Irrigation (5:00 - 8:00 AM)",
                "Mulch Top-up (3-5 cm rice straw)",
            ],
            "inputs": ["Balanced Complete Fertilizer (14-14-14 N-P-K)"],
            "avoid": ["Excessive synthetic Nitrogen application"],
        },
    }


def _make_simulated_upstream(delay_s: float = 0.0):
    def _upstream(municipality: str, window: str) -> dict:
        if delay_s > 0.0:
            time.sleep(delay_s)
        return _make_deterministic_payload(municipality, window)

    return _upstream


def _percentile(sorted_values: list[float], pct: float) -> float:
    """Compute percentile using linear interpolation on a sorted list."""
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (pct / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (k - f) * (sorted_values[c] - sorted_values[f])


def test_tc01_cold_start_cache_miss():
    """TC-01: Cold-start cache miss for Naic triggers exactly 1 upstream call."""
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=baseline, maxsize=256, ttl=3600)

    assert isinstance(baseline, TelemetryProvider)
    assert isinstance(cached, TelemetryProvider)

    payload = cached.get_municipal_telemetry("Naic", "30d")

    assert payload["status"] == "Success"
    assert payload["municipality"] == "naic"
    assert baseline.upstream_calls == 1
    assert cached.metrics.misses == 1
    assert cached.metrics.hits == 0
    assert cached.metrics.hit_ratio() == 0.0
    assert cached.cache_size == 1


def test_tc02_warm_cache_hit():
    """TC-02: Repeated query for Naic is served from cache with zero extra upstream calls."""
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=baseline, maxsize=256, ttl=3600)

    first = cached.get_municipal_telemetry("Naic", "30d")
    second = cached.get_municipal_telemetry("Naic", "30d")

    assert first == second
    assert baseline.upstream_calls == 1
    assert cached.metrics.misses == 1
    assert cached.metrics.hits == 1
    assert cached.metrics.hit_ratio() == pytest.approx(0.5)


def test_tc03_key_normalization():
    """TC-03: Whitespace and case variants (' Naic ' vs 'naic') resolve to the same cache key."""
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=baseline, maxsize=256, ttl=3600)

    first = cached.get_municipal_telemetry(" Naic ", " 30D ")
    second = cached.get_municipal_telemetry("naic", "30d")
    third = cached.get_municipal_telemetry("NAIC", "30d")

    assert first == second == third
    assert baseline.upstream_calls == 1
    assert cached.metrics.misses == 1
    assert cached.metrics.hits == 2
    assert cached.cache_size == 1


def test_tc04_deep_json_payload_equivalence(monkeypatch):
    """
    TC-04: 100% deep JSON payload equivalence between Baseline (uncached) and
    Proposed (cached) for NDVI, EVI, NDWI, LSWI, NDRE, forecast_ndvi_30d,
    risk_tier, and confidence_score.
    """
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached_backing = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=cached_backing, maxsize=256, ttl=3600)

    baseline_payload = baseline.get_municipal_telemetry("Silang", "30d")
    _ = cached.get_municipal_telemetry("Silang", "30d")  # prime cache
    cached_payload = cached.get_municipal_telemetry("Silang", "30d")  # warm hit

    required_fields = (
        "NDVI",
        "EVI",
        "NDWI",
        "LSWI",
        "NDRE",
        "forecast_ndvi_30d",
        "risk_tier",
        "confidence_score",
    )
    for field in required_fields:
        assert field in baseline_payload
        assert field in cached_payload
        assert cached_payload[field] == baseline_payload[field]

    assert json.dumps(cached_payload, sort_keys=True) == json.dumps(
        baseline_payload, sort_keys=True
    )

    # Verify FastAPI route & dependency toggle (ENABLE_TELEMETRY_CACHE=false vs true)
    monkeypatch.setattr(backend_main, "_uncached_telemetry_service", baseline)
    monkeypatch.setattr(backend_main, "_cached_telemetry_decorator", cached)
    client = TestClient(backend_main.app)

    monkeypatch.setenv("ENABLE_TELEMETRY_CACHE", "false")
    res_baseline = client.get("/predict/ndvi", params={"city_name": "Silang", "window": "30d"})
    assert res_baseline.status_code == 200

    monkeypatch.setenv("ENABLE_TELEMETRY_CACHE", "true")
    res_cached = client.get("/predict/ndvi", params={"city_name": "Silang", "window": "30d"})
    assert res_cached.status_code == 200

    assert json.dumps(res_cached.json(), sort_keys=True) == json.dumps(
        res_baseline.json(), sort_keys=True
    )


def test_tc05_ttl_expiration():
    """TC-05: Entry expires after ttl=0.2s and triggers a fresh upstream call."""
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=baseline, maxsize=256, ttl=0.2)

    cached.get_municipal_telemetry("Naic", "30d")
    cached.get_municipal_telemetry("Naic", "30d")
    assert baseline.upstream_calls == 1
    assert cached.metrics.hits == 1
    assert cached.metrics.misses == 1

    time.sleep(0.25)

    cached.get_municipal_telemetry("Naic", "30d")
    assert baseline.upstream_calls == 2
    assert cached.metrics.misses == 2
    assert cached.metrics.hits == 1


def test_tc06_manual_invalidation(monkeypatch):
    """TC-06: Manual invalidate('naic') purges only Naic and forces next Naic call upstream."""
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=baseline, maxsize=256, ttl=3600)

    cached.get_municipal_telemetry("Naic", "30d")
    cached.get_municipal_telemetry("Naic", "90d")
    cached.get_municipal_telemetry("Silang", "30d")
    assert baseline.upstream_calls == 3
    assert cached.cache_size == 3

    removed = cached.invalidate("naic")
    assert removed == 2
    assert cached.metrics.invalidations == 2
    assert cached.cache_size == 1

    # Silang remains cached (warm hit)
    cached.get_municipal_telemetry("Silang", "30d")
    assert baseline.upstream_calls == 3
    assert cached.metrics.hits == 1

    # Naic must now miss and call upstream
    cached.get_municipal_telemetry("Naic", "30d")
    assert baseline.upstream_calls == 4
    assert cached.metrics.misses == 4

    # Verify FastAPI observability & invalidation endpoints
    monkeypatch.setattr(backend_main, "_uncached_telemetry_service", baseline)
    monkeypatch.setattr(backend_main, "_cached_telemetry_decorator", cached)
    client = TestClient(backend_main.app)

    metrics_res = client.get("/api/cache/metrics")
    assert metrics_res.status_code == 200
    metrics_json = metrics_res.json()
    assert metrics_json["hits"] == 1
    assert metrics_json["misses"] == 4
    assert metrics_json["invalidations"] == 2

    inv_res = client.post("/api/cache/invalidate", params={"municipality": "Naic"})
    assert inv_res.status_code == 200
    assert inv_res.json()["entries_removed"] == 1

    clear_res = client.post("/api/cache/invalidate")
    assert clear_res.status_code == 200
    assert cached.cache_size == 0


def test_tc07_100_request_hotspot_benchmark():
    """
    TC-07: 100-request hotspot benchmark across 8 Cavite municipalities
    (8 cold misses + 92 repeated queries). Compares Baseline vs. Proposed latency,
    upstream calls, and hit ratio.
    """
    # Simulate realistic upstream GEE + ML compute latency (15 ms/call)
    simulated_upstream_delay_s = 0.015

    # Build deterministic 100-request sequence: 8 initial cold misses + 92 repeated queries
    request_sequence = list(HOTSPOT_MUNICIPALITIES) + [
        HOTSPOT_MUNICIPALITIES[i % len(HOTSPOT_MUNICIPALITIES)] for i in range(92)
    ]
    assert len(request_sequence) == 100

    # --- Baseline (Uncached) ---
    baseline_service = UncachedTelemetryService(
        upstream_fn=_make_simulated_upstream(delay_s=simulated_upstream_delay_s)
    )
    baseline_latencies_ms: list[float] = []
    for city in request_sequence:
        t0 = time.perf_counter()
        baseline_service.get_municipal_telemetry(city, "30d")
        baseline_latencies_ms.append((time.perf_counter() - t0) * 1000.0)

    # --- Proposed (TTL Cache-Aside Decorator) ---
    proposed_backing = UncachedTelemetryService(
        upstream_fn=_make_simulated_upstream(delay_s=simulated_upstream_delay_s)
    )
    proposed_service = CachedTelemetryDecorator(
        provider=proposed_backing, maxsize=256, ttl=3600
    )
    proposed_latencies_ms: list[float] = []
    for city in request_sequence:
        t0 = time.perf_counter()
        proposed_service.get_municipal_telemetry(city, "30d")
        proposed_latencies_ms.append((time.perf_counter() - t0) * 1000.0)

    b_sorted = sorted(baseline_latencies_ms)
    p_sorted = sorted(proposed_latencies_ms)

    b_mean = statistics.mean(b_sorted)
    b_p50 = _percentile(b_sorted, 50)
    b_p95 = _percentile(b_sorted, 95)

    p_mean = statistics.mean(p_sorted)
    p_p50 = _percentile(p_sorted, 50)
    p_p95 = _percentile(p_sorted, 95)

    hit_ratio_pct = proposed_service.metrics.hit_ratio() * 100.0

    print("\n")
    print("=" * 82)
    print("  TC-07: 100-REQUEST CAVITE HOTSPOT BENCHMARK (8 Cold Misses + 92 Warm Hits)")
    print("=" * 82)
    print(
        f"{'Variant':<26} | {'Mean (ms)':>10} | {'p50 (ms)':>9} | {'p95 (ms)':>9} | {'Upstream':>8} | {'Hit Ratio':>9}"
    )
    print("-" * 82)
    print(
        f"{'Baseline (Uncached)':<26} | {b_mean:>10.3f} | {b_p50:>9.3f} | {b_p95:>9.3f} | {baseline_service.upstream_calls:>8d} | {'0.00%':>9}"
    )
    print(
        f"{'Proposed (TTL Cached)':<26} | {p_mean:>10.3f} | {p_p50:>9.3f} | {p_p95:>9.3f} | {proposed_backing.upstream_calls:>8d} | {hit_ratio_pct:>8.2f}%"
    )
    print("=" * 82)

    assert baseline_service.upstream_calls == 100
    assert proposed_backing.upstream_calls == 8
    assert proposed_service.metrics.misses == 8
    assert proposed_service.metrics.hits == 92
    assert proposed_service.metrics.hit_ratio() == pytest.approx(0.92)
    assert p_mean < b_mean
    assert p_p50 < b_p50


def test_tc08_peak_heap_memory_256_entries():
    """TC-08: Measure peak heap memory for 256 cached entries via tracemalloc (< 50 MB)."""
    baseline = UncachedTelemetryService(upstream_fn=_make_simulated_upstream())
    cached = CachedTelemetryDecorator(provider=baseline, maxsize=256, ttl=3600)

    tracemalloc.start()
    try:
        for idx in range(256):
            municipality = f"cavite_zone_{idx:03d}"
            cached.get_municipal_telemetry(municipality, "30d")
        current_bytes, peak_bytes = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    peak_kb = peak_bytes / 1024.0
    peak_mb = peak_bytes / (1024.0 * 1024.0)
    current_kb = current_bytes / 1024.0

    print("\n")
    print("=" * 68)
    print("  TC-08: PEAK HEAP MEMORY CHECK (256 Cached Entries via tracemalloc)")
    print("=" * 68)
    print(f"  Cached Entries : {cached.cache_size} / 256")
    print(f"  Current Heap   : {current_kb:.2f} KB")
    print(f"  Peak Heap      : {peak_kb:.2f} KB ({peak_mb:.4f} MB)")
    print(f"  Memory Budget  : < 50.00 MB (51200.00 KB)")
    print("=" * 68)

    assert cached.cache_size == 256
    assert peak_bytes < 50 * 1024 * 1024
