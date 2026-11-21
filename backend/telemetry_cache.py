"""
telemetry_cache.py — Decoupled TTL Cache-Aside Decorator for Cavite Agri-Watch.

Implements a clean Decorator pattern around the existing municipal telemetry
and 30-day crop stress forecast pipeline without modifying gee_extraction.py,
paper_models.py, or zone_analysis.py.
"""

from __future__ import annotations

import copy
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple

from cachetools import TTLCache


class TelemetryProvider(ABC):
    """Abstract interface for retrieving municipal satellite telemetry & forecasts."""

    @abstractmethod
    def get_municipal_telemetry(self, municipality: str, window: str = "30d") -> dict:
        """Return telemetry indices and 30-day forecast payload for a municipality."""
        raise NotImplementedError


@dataclass
class CacheMetrics:
    """Thread-safe observability counters for the TTL cache decorator."""

    hits: int = 0
    misses: int = 0
    invalidations: int = 0

    def hit_ratio(self) -> float:
        """Return cache hit ratio in [0.0, 1.0]."""
        total = self.hits + self.misses
        if total == 0:
            return 0.0
        return self.hits / total

    def to_dict(self) -> Dict[str, Any]:
        """Serialize metrics for API observability endpoints."""
        return {
            "hits": self.hits,
            "misses": self.misses,
            "invalidations": self.invalidations,
            "hit_ratio": round(self.hit_ratio(), 4),
        }


class UncachedTelemetryService(TelemetryProvider):
    """
    Baseline provider that invokes the upstream GEE + ML telemetry pipeline on
    every request and counts total upstream calls.
    """

    def __init__(
        self,
        upstream_fn: Optional[Callable[[str, str], dict]] = None,
        ee_module: Any = None,
        agri_model_getter: Optional[Callable[[], Any]] = None,
    ) -> None:
        self._upstream_fn = upstream_fn
        self._ee = ee_module
        self._agri_model_getter = agri_model_getter
        self._lock = threading.RLock()
        self.upstream_calls: int = 0

    def _default_upstream_call(self, municipality: str, window: str) -> dict:
        """Execute the existing zone_analysis GEE + ML pipeline directly (uncached)."""
        import zone_analysis

        ee_mod = self._ee
        if ee_mod is None:
            import ee as ee_mod  # type: ignore

        agri_model = self._agri_model_getter() if self._agri_model_getter else None
        key = zone_analysis._slug(municipality)

        if key in ("", zone_analysis._slug(zone_analysis.PROVINCE_NAME), "cavite"):
            geom = zone_analysis.province_geometry(ee_mod)
            return zone_analysis.analyze(
                ee_mod, geom, zone_analysis.PROVINCE_NAME, agri_model, scale=120
            )

        geom = zone_analysis.municipality_geometry(municipality)
        if geom is None:
            return {
                "status": "Error",
                "message": f"No boundary available for '{municipality}'.",
            }
        return zone_analysis.analyze(ee_mod, geom, municipality, agri_model, scale=30)

    def get_municipal_telemetry(self, municipality: str, window: str = "30d") -> dict:
        with self._lock:
            self.upstream_calls += 1

        if self._upstream_fn is not None:
            return self._upstream_fn(municipality, window)
        return self._default_upstream_call(municipality, window)


class CachedTelemetryDecorator(TelemetryProvider):
    """
    Proposed TTL Cache-Aside Decorator wrapping any TelemetryProvider.

    Uses cachetools.TTLCache guarded by threading.RLock(), deterministic
    (municipality, window) key normalization, explicit invalidation, and
    hit/miss/invalidation metrics tracking.
    """

    def __init__(
        self,
        provider: TelemetryProvider,
        maxsize: int = 256,
        ttl: float = 3600,
    ) -> None:
        self._provider = provider
        self._maxsize = maxsize
        self._ttl = ttl
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = threading.RLock()
        self.metrics = CacheMetrics()

    @staticmethod
    def normalize_key(municipality: str, window: str) -> Tuple[str, str]:
        """Deterministically normalize cache lookup keys."""
        return (municipality.strip().lower(), window.strip().lower())

    @property
    def cache_size(self) -> int:
        with self._lock:
            return len(self._cache)

    def get_municipal_telemetry(self, municipality: str, window: str = "30d") -> dict:
        key = self.normalize_key(municipality, window)

        with self._lock:
            if key in self._cache:
                self.metrics.hits += 1
                return copy.deepcopy(self._cache[key])
            self.metrics.misses += 1

        result = self._provider.get_municipal_telemetry(municipality, window)

        if isinstance(result, dict) and result.get("status") != "Error":
            with self._lock:
                self._cache[key] = copy.deepcopy(result)

        return result

    def invalidate(self, municipality: str) -> int:
        """Invalidate all cached windows for a specific municipality. Returns count removed."""
        target = municipality.strip().lower()
        removed = 0
        with self._lock:
            keys_to_remove = [k for k in list(self._cache.keys()) if k[0] == target]
            for k in keys_to_remove:
                if self._cache.pop(k, None) is not None:
                    removed += 1
            self.metrics.invalidations += removed
        return removed

    def clear_all(self) -> None:
        """Clear all entries from the cache and record invalidations."""
        with self._lock:
            removed = len(self._cache)
            self._cache.clear()
            self.metrics.invalidations += removed

    def get_metrics(self) -> Dict[str, Any]:
        """Return a snapshot of cache metrics and configuration."""
        with self._lock:
            data = self.metrics.to_dict()
            data["cache_size"] = len(self._cache)
            data["maxsize"] = self._maxsize
            data["ttl"] = self._ttl
            if isinstance(self._provider, UncachedTelemetryService):
                data["upstream_calls"] = self._provider.upstream_calls
            return data
