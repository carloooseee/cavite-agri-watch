# Software Engineering 2 — Live Demo Guide
## Cavite Agri-Watch: Decoupled TTL Cache-Aside Decorator (`feat/se2-telemetry-cache`)

This guide walks you step-by-step through what to open, what commands to run, what to click on screen, and what to say during your live Software Engineering 2 demonstration.

---

## 0. Pre-Demo Checklist (Do This 2 Minutes Before Presenting)

1. Confirm you are on the feature branch:
   ```powershell
   git branch --show-current
   ```
   *(Expected output: `feat/se2-telemetry-cache`)*

2. Start both the Frontend and Backend in one command from `c:\Programming\cavite-agri-watch`:
   ```powershell
   npm run dev
   ```
   *(Or double-click `dev.bat`)*

3. Wait until you see both servers ready, then open these **3 browser tabs**:
   - **Tab 1 (Live App):** `http://localhost:5173`
   - **Tab 2 (Swagger API Docs):** `http://localhost:8000/docs`
   - **Tab 3 (Live Cache Metrics JSON):** `http://localhost:8000/api/cache/metrics`

4. Keep one clean PowerShell terminal open in `c:\Programming\cavite-agri-watch` for running the automated tests and `Invoke-RestMethod` commands.

---

## Part 1: Architecture & Non-Invasive Design (1–2 Minutes)

**Goal:** Prove to your professor that you followed the **Open/Closed Principle** and **Decorator Pattern** without modifying any legacy ML or Google Earth Engine modules.

### What to Run / Show:
```powershell
git diff --stat main
```
*Point out that `gee_extraction.py`, `paper_models.py`, and `zone_analysis.py` are **completely untouched**.*

### What to Open Briefly in VS Code:
1. **`backend/telemetry_cache.py`**:
   - `TelemetryProvider` (Abstract Base Class / interface)
   - `UncachedTelemetryService` (**Baseline** — calls GEE + ML every time and counts `upstream_calls`)
   - `CachedTelemetryDecorator` (**Proposed** — wraps any `TelemetryProvider` with `cachetools.TTLCache(maxsize=256, ttl=3600)` guarded by `threading.RLock()`)
   - `CacheMetrics` dataclass (`hits`, `misses`, `invalidations`, `hit_ratio()`)
2. **`backend/main.py`**:
   - `get_telemetry_provider()` FastAPI dependency controlled by `ENABLE_TELEMETRY_CACHE=true|false`
   - `GET /predict/ndvi` wired via `Depends(get_telemetry_provider)`
   - `GET /api/cache/metrics` and `POST /api/cache/invalidate`
   - Automatic cache invalidation hooked into `/sync-data` after model retraining.

### What to Say:
> *"Instead of hardcoding caching logic inside our satellite or ML scripts, we implemented a decoupled TTL Cache-Aside Decorator. `UncachedTelemetryService` is our Baseline, and `CachedTelemetryDecorator` wraps it transparently behind the `TelemetryProvider` interface. We can switch between Baseline and Proposed at runtime via the `ENABLE_TELEMETRY_CACHE` environment variable."*

---

## Part 2: Live Dashboard Demo — Cold Miss vs. Warm Hit (2 Minutes)

**Goal:** Visually show the latency drop in the real Cavite Agri-Watch web app.

### Steps on Screen:
1. Switch to **Tab 3** (`http://localhost:8000/api/cache/metrics`) and refresh.
   - Point out initial state: `hits: 0`, `misses: 0`, `upstream_calls: 0`, `cache_size: 0`.
2. Switch to **Tab 1** (`http://localhost:5173`), open **Browser DevTools → Network tab** (optional, makes latency visible in ms).
3. Select **Naic** and trigger the AI Forecast:
   - **Observe:** Takes a few seconds because it is a **cold-start cache miss** hitting Google Earth Engine + Random Forest/CNN.
4. Refresh **Tab 3** (`http://localhost:8000/api/cache/metrics`):
   - **Observe:** `misses: 1`, `hits: 0`, `upstream_calls: 1`, `cache_size: 1`.
5. Go back to **Tab 1**, select **Silang** (or another town), then switch back to **Naic** and trigger the forecast again:
   - **Observe:** **Naic** loads almost instantly (**warm cache hit**) with the exact same NDVI, EVI, NDWI, LSWI, NDRE, 30-day forecast, and advisories.
6. Refresh **Tab 3** (`http://localhost:8000/api/cache/metrics`):
   - **Observe:** `hits` incremented to `1`, `hit_ratio` rose, and `upstream_calls` did **not** increase for the repeat Naic query.

---

## Part 3: Live API Controls — Key Normalization & Invalidation (2 Minutes)

**Goal:** Show deterministic key normalization and manual cache invalidation live via Swagger UI (`http://localhost:8000/docs`) or PowerShell.

### Option A: PowerShell Commands (Fastest & Cleanest)

1. **Test Key Normalization (`" Naic "` vs `"naic"`):**
   ```powershell
   Invoke-RestMethod "http://localhost:8000/predict/ndvi?city_name=%20Naic%20" | Select-Object city, current_ndvi, forecast_30_days, classification
   Invoke-RestMethod "http://localhost:8000/api/cache/metrics"
   ```
   - **Point out:** Even with leading/trailing spaces and different capitalization, `hits` increments and `upstream_calls` stays the same because keys normalize to `(municipality.strip().lower(), window.strip().lower())`.

2. **Test Targeted Municipality Invalidation (`Naic` only):**
   ```powershell
   Invoke-RestMethod -Method Post "http://localhost:8000/api/cache/invalidate?municipality=Naic"
   Invoke-RestMethod "http://localhost:8000/api/cache/metrics"
   ```
   - **Point out:** `entries_removed: 1`, `invalidations` increments, and `cache_size` drops by 1 (while other municipalities like `Silang` stay cached).

3. **Test Full Cache Purge:**
   ```powershell
   Invoke-RestMethod -Method Post "http://localhost:8000/api/cache/invalidate"
   Invoke-RestMethod "http://localhost:8000/api/cache/metrics"
   ```
   - **Point out:** `cache_size: 0`.

*(Option B: You can also click **Try it out → Execute** on `GET /api/cache/metrics` and `POST /api/cache/invalidate` directly in Tab 2 at `http://localhost:8000/docs`.)*

---

## Part 4: Automated Verification & Benchmark Suite (2 Minutes)

**Goal:** Prove all 8 functional, equivalence, latency, and memory test cases pass deterministically.

### Run This Command in PowerShell:
```powershell
.\backend\venv\Scripts\python.exe -m pytest -o addopts="" backend/tests/test_telemetry_cache.py -v -s
```

### What to Highlight in the Terminal Output:
1. **Functional Correctness (`TC-01` to `TC-06`):**
   - `TC-01`: Cold-start cache miss (`Naic`) — `1` upstream call, `1` miss.
   - `TC-02`: Warm cache hit (`Naic`) — `0` extra upstream calls.
   - `TC-03`: Key normalization (`" Naic "` vs `"naic"` vs `"NAIC"`) — resolves to 1 cache entry.
   - `TC-04`: **100% deep JSON payload equivalence** across `NDVI`, `EVI`, `NDWI`, `LSWI`, `NDRE`, `forecast_ndvi_30d`, `risk_tier`, and `confidence_score` (both direct and via FastAPI `ENABLE_TELEMETRY_CACHE=false` vs `true`).
   - `TC-05`: TTL expiration (`ttl=0.2s` + `sleep(0.25s)`) — expired entry triggers fresh upstream call.
   - `TC-06`: Manual invalidation (`invalidate("naic")`) — purges only Naic, keeps Silang warm, and verifies `/api/cache/metrics` + `/api/cache/invalidate`.

2. **100-Request Hotspot Benchmark (`TC-07` — 8 Cavite Municipalities: 8 Cold Misses + 92 Warm Hits):**
   | Variant | Mean (ms) | p50 (ms) | p95 (ms) | Upstream Calls | Hit Ratio |
   | :--- | :---: | :---: | :---: | :---: | :---: |
   | **Baseline (Uncached)** | `15.588` | `15.554` | `16.116` | `100` | `0.00%` |
   | **Proposed (TTL Cached)** | `1.256` | `0.006` | `15.499` | `8` | `92.00%` |

   - **Key takeaway:** **92% reduction in upstream GEE/ML calls** (`100` → `8`) and **>90% reduction in mean latency** (with median `p50` dropping to `< 0.01 ms`).

3. **Bounded Memory Check (`TC-08` — 256 Cached Entries via `tracemalloc`):**
   - Peak heap memory: **`~366.62 KB` (`0.36 MB`)** — well below the **`50 MB`** budget.

---

## Part 5: Quick Q&A Cheat Sheet (If the Professor Asks)

* **Q: Why use the Decorator Pattern instead of editing `zone_analysis.py` directly?**  
  **A:** It follows the **Open/Closed Principle** and **Single Responsibility Principle**. Core geospatial/ML logic stays pure and testable, while caching, metrics, and TTL eviction live in an independent wrapper that can be toggled on/off via FastAPI Dependency Injection (`ENABLE_TELEMETRY_CACHE`).

* **Q: Why `threading.RLock()` around `TTLCache`?**  
  **A:** FastAPI executes blocking telemetry calls across worker threads via `asyncio.to_thread(...)`. `cachetools.TTLCache` is not thread-safe on its own, so `RLock` prevents race conditions during concurrent reads, writes, evictions, and metric updates.

* **Q: What happens if stale data is cached when new satellite data is synced or the model is retrained?**  
  **A:** Two safeguards: (1) Automatic **TTL expiration** after 3600 seconds (1 hour), and (2) **Explicit invalidation** — `/sync-data` calls `_cached_telemetry_decorator.clear_all()` right after retraining, and admins can manually purge any municipality via `POST /api/cache/invalidate`.

* **Q: Why does `CachedTelemetryDecorator` return `deepcopy` of cached payloads?**  
  **A:** To prevent downstream route handlers from mutating the shared in-memory dictionary and to guarantee **100% deep JSON payload equivalence** across repeated hits.
