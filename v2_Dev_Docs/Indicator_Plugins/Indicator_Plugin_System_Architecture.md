# Indicator Plugin System — Detailed Architectural Plan
> **Target Version:** QuFLX v3  
> **Status:** 📐 ARCHITECTURAL DESIGN — Not yet implemented  
> **Created:** 2026-03-16  
> **Author:** @Architect  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture — Pain Points](#2-current-architecture--pain-points)
3. [Design Goals & Constraints](#3-design-goals--constraints)
4. [System Overview](#4-system-overview)
5. [Layer 1 — The Indicator Manifest](#5-layer-1--the-indicator-manifest)
6. [Layer 2 — The Python Calculation Module](#6-layer-2--the-python-calculation-module)
7. [Layer 3 — The Backend Plugin Registry](#7-layer-3--the-backend-plugin-registry)
8. [Layer 4 — The Gateway Route (Refactored)](#8-layer-4--the-gateway-route-refactored)
9. [Layer 5 — The Frontend Renderer Registry](#9-layer-5--the-frontend-renderer-registry)
10. [Layer 6 — Dynamic Catalog API](#10-layer-6--dynamic-catalog-api)
11. [Layer 7 — Licensing & Pack Management](#11-layer-7--licensing--pack-management)
12. [Layer 8 — User-Written Indicators](#12-layer-8--user-written-indicators)
13. [File & Folder Structure](#13-file--folder-structure)
14. [Full API Specification](#14-full-api-specification)
15. [Data Contracts & Schemas](#15-data-contracts--schemas)
16. [Migration Plan (v2 → v3)](#16-migration-plan-v2--v3)
17. [Security Model](#17-security-model)
18. [Testing Strategy](#18-testing-strategy)
19. [Pine Script — Why It Doesn't Apply](#19-pine-script--why-it-doesnt-apply)
20. [Decision Log](#20-decision-log)

---

## 1. Executive Summary

The current QuFLX v2 indicator system is **monolithic and hardcoded**. Every indicator requires simultaneous edits to 5 separate files across the backend and frontend. There is no mechanism to add, remove, or distribute indicators as independent units.

This document defines the architecture for a **plugin-based indicator system** for v3 that enables:

- **Indicator Packs** — curated sets of indicators distributed as installable packages
- **Purchased Packs** — premium indicators unlocked via license key
- **User-Written Indicators** — power users can write and upload their own Python calculation modules
- **Zero-friction extensibility** — adding a new indicator requires dropping a folder, not editing core files

The system is designed as a **4-phase migration** so v2 functionality is never broken during the transition.

---

## 2. Current Architecture — Pain Points

### The "5-File Problem"

Adding a single new indicator in v2 requires editing **all 5 of these files simultaneously**:

| File | What Must Change |
|---|---|
| `backend/services/strategy/indicators.py` | Add `_calculate_new_indicator()` method + params to `self.params` dict + fields to `IndicatorSet` dataclass |
| `backend/services/gateway/routes/indicators.py` | Add column to `_build_series()` numeric/string/bool lists + add mapping in `_map_params()` |
| `gui/Dashboard/src/config/chartOptions.js` | Add entry to `indicatorOptions` array with label, params, paramConfig |
| `gui/Dashboard/src/hooks/useOverlayIndicators.js` | Add `if (type === 'new_indicator')` rendering branch |
| `gui/Dashboard/src/components/OscillatorChart.jsx` | Add oscillator rendering case (if oscillator kind) |

**Missing any one of these = silent failure or broken chart.**

### Additional Problems

- `_map_params()` is a 60-line if/elif chain that must be manually kept in sync with `chartOptions.js`
- `IndicatorSet` dataclass has 40+ hardcoded fields — adding one requires a dataclass change + `create_indicator_set()` update
- `KNOWN_INDICATOR_TYPES` array in `useChartWorkspaceIndicators.js` must be manually updated
- No way to disable/unload an indicator without code changes
- No versioning — if an indicator's calculation changes, there's no way to know

---

## 3. Design Goals & Constraints

### Goals

| # | Goal | Priority |
|---|---|---|
| G1 | Adding a new indicator = drop a folder, zero core file edits | Critical |
| G2 | Existing v2 indicators continue working unchanged during migration | Critical |
| G3 | Indicator packs can be installed/uninstalled at runtime | High |
| G4 | License enforcement for premium packs | High |
| G5 | Users can write and upload custom Python indicators | Medium |
| G6 | Custom frontend renderers for complex visualizations | Medium |
| G7 | Indicator catalog is discoverable via API (for future marketplace) | Medium |

### Constraints

- **No Pine Script** — Lightweight Charts is a rendering library only; it has no scripting runtime. All indicator logic must be Python (backend) or JavaScript (frontend renderer). See [Section 19](#19-pine-script--why-it-doesnt-apply).
- **No new UI libraries** — Tailwind + lucide-react only (per `.agentrules.md`)
- **Backward compatibility** — v2 indicator API contract (`POST /api/v1/indicators`) must remain unchanged
- **No subprocess spawning** — OPT-1 architecture (in-process, `asyncio.to_thread`) must be preserved
- **Python sandbox** — user-uploaded code must not have filesystem or network access

---

## 4. System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INDICATOR PLUGIN SYSTEM                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  FRONTEND                          BACKEND                               │
│  ─────────                         ───────                               │
│                                                                           │
│  ┌─────────────────┐               ┌──────────────────────────────────┐  │
│  │  Indicator       │  GET /catalog │  IndicatorRegistry               │  │
│  │  Catalog UI      │◄─────────────│  - loads all manifests on startup │  │
│  │  (dynamic from   │              │  - validates Python modules       │  │
│  │   API response)  │              │  - enforces license checks        │  │
│  └────────┬─────────┘              └──────────────┬───────────────────┘  │
│           │                                        │                      │
│  ┌────────▼─────────┐              ┌──────────────▼───────────────────┐  │
│  │  Renderer        │  POST /calc  │  Pipeline Orchestrator            │  │
│  │  Registry        │◄─────────────│  - calls registry.calculate()    │  │
│  │  - builtin types │              │    for each requested indicator   │  │
│  │  - custom .js    │              │  - passes params directly         │  │
│  └──────────────────┘              │  - no _map_params() needed        │  │
│                                    └──────────────────────────────────┘  │
│                                                                           │
│  INDICATOR PACKS (filesystem)                                             │
│  ─────────────────────────────                                            │
│  indicators/                                                              │
│    builtin/          ← ships with app, always loaded                     │
│      ema_cross/                                                           │
│        manifest.json                                                      │
│        calculate.py                                                       │
│    packs/            ← installed packs (purchased or user-uploaded)      │
│      smart_money/                                                         │
│        manifest.json                                                      │
│        calculate.py                                                       │
│        renderer.js   ← optional custom frontend renderer                 │
│      my_indicator/   ← user-written                                      │
│        manifest.json                                                      │
│        calculate.py                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Layer 1 — The Indicator Manifest

The `manifest.json` is the **single source of truth** for everything about an indicator. It replaces the hardcoded entry in `chartOptions.js` and the hardcoded column lists in `_build_series()`.

### Full Manifest Schema

```json
{
  "$schema": "https://qflx.io/schemas/indicator-manifest/v1.json",

  "id": "smart_money_concepts",
  "version": "1.2.0",
  "label": "Smart Money Concepts",
  "description": "Identifies Order Blocks, Fair Value Gaps, and Break of Structure events.",
  "author": "QuFLX Labs",
  "homepage": "https://qflx.io/packs/smart-money",

  "license": "pack:premium",
  "pack_id": "smc_pack_v1",
  "min_app_version": "3.0.0",

  "kind": "overlay",

  "outputs": [
    { "name": "ob_high",      "type": "numeric", "label": "Order Block High" },
    { "name": "ob_low",       "type": "numeric", "label": "Order Block Low" },
    { "name": "ob_type",      "type": "string",  "label": "OB Type (bull/bear)" },
    { "name": "fvg_high",     "type": "numeric", "label": "Fair Value Gap High" },
    { "name": "fvg_low",      "type": "numeric", "label": "Fair Value Gap Low" },
    { "name": "bos_signal",   "type": "boolean", "label": "Break of Structure" },
    { "name": "bos_price",    "type": "numeric", "label": "BOS Price Level" }
  ],

  "params": [
    { "name": "lookback",     "label": "Lookback Period",          "type": "number",  "min": 5,   "max": 200, "default": 20 },
    { "name": "show_fvg",     "label": "Show Fair Value Gaps",     "type": "boolean", "default": true },
    { "name": "show_bos",     "label": "Show Break of Structure",  "type": "boolean", "default": true },
    { "name": "ob_strength",  "label": "Min OB Strength (ATR×)",  "type": "number",  "min": 0.5, "max": 5.0, "step": 0.1, "default": 1.5 }
  ],

  "renderer": "box_series",

  "tags": ["smart_money", "price_action", "institutional"],
  "min_candles": 50
}
```

### Manifest Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique snake_case identifier. Used as the param key in API calls. |
| `version` | semver | ✅ | Pack version. Used for update detection. |
| `label` | string | ✅ | Display name shown in the UI picker. |
| `description` | string | ❌ | Shown in the indicator store / tooltip. |
| `author` | string | ✅ | Pack author name. |
| `license` | enum | ✅ | `"builtin"` \| `"pack:free"` \| `"pack:premium"` \| `"user"` |
| `pack_id` | string | ❌ | Groups multiple indicators into one purchasable pack. |
| `min_app_version` | semver | ❌ | Minimum QuFLX version required. |
| `kind` | enum | ✅ | `"overlay"` \| `"oscillator"` — determines rendering pane. |
| `outputs` | array | ✅ | Declares every DataFrame column the `calculate()` function will add. |
| `outputs[].name` | string | ✅ | Column name in the DataFrame. Must be unique across all loaded plugins. |
| `outputs[].type` | enum | ✅ | `"numeric"` \| `"string"` \| `"boolean"` \| `"integer"` — determines extraction method. |
| `outputs[].label` | string | ✅ | Human-readable label for the series. |
| `params` | array | ✅ | Parameter definitions. Same schema as current `paramConfig` in `chartOptions.js`. |
| `renderer` | string | ✅ | Built-in renderer name OR `"custom"` (requires `renderer.js` in same folder). |
| `tags` | string[] | ❌ | Used for filtering in the indicator store. |
| `min_candles` | integer | ❌ | Minimum candles needed for meaningful output. Used for validation warnings. |

### License Values

| Value | Meaning | Behavior |
|---|---|---|
| `"builtin"` | Ships with the app | Always loaded, cannot be uninstalled |
| `"pack:free"` | Free downloadable pack | Loaded if installed, no key required |
| `"pack:premium"` | Paid pack | Requires valid license key to activate |
| `"user"` | User-uploaded | Loaded from user's personal pack folder |

---

## 6. Layer 2 — The Python Calculation Module

### The Contract

Every indicator's `calculate.py` must expose **exactly one function** with this signature:

```python
def calculate(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    ...
```

**Rules (enforced by the registry validator):**
1. Must accept `df: pd.DataFrame` and `params: dict`
2. Must return a `pd.DataFrame`
3. Must add **only** the columns declared in `manifest.json outputs`
4. Must **not** modify existing columns (`open`, `high`, `low`, `close`, `timestamp`, or any column added by a previously-run indicator)
5. Must handle `params` gracefully — use `.get(key, default)` for all param access
6. Must not import `os`, `sys`, `subprocess`, `socket`, `requests`, `httpx`, or any network/filesystem library (enforced by AST scanner for user-uploaded code)
7. Must not raise unhandled exceptions — wrap logic in try/except and return `df` unchanged on error

### Example: EMA Cross-Over (migrated from v2)

```python
# indicators/builtin/ema_cross/calculate.py
import pandas as pd
import numpy as np

def calculate(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    """
    EMA Cross-Over: three configurable EMA lines.
    Outputs: ema_cross_fast, ema_cross_med, ema_cross_slow
    """
    try:
        fast = int(params.get('fast', 21))
        med  = int(params.get('med',  50))
        slow = int(params.get('slow', 100))

        df['ema_cross_fast'] = df['close'].ewm(span=fast, adjust=False).mean()
        df['ema_cross_med']  = df['close'].ewm(span=med,  adjust=False).mean()
        df['ema_cross_slow'] = df['close'].ewm(span=slow, adjust=False).mean()

    except Exception:
        df['ema_cross_fast'] = np.nan
        df['ema_cross_med']  = np.nan
        df['ema_cross_slow'] = np.nan

    return df
```

### Example: Smart Money Concepts (new premium indicator)

```python
# indicators/packs/smart_money_concepts/calculate.py
import pandas as pd
import numpy as np

def calculate(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    """
    Smart Money Concepts: Order Blocks, FVGs, Break of Structure.
    """
    try:
        lookback   = int(params.get('lookback', 20))
        show_fvg   = bool(params.get('show_fvg', True))
        show_bos   = bool(params.get('show_bos', True))
        ob_strength = float(params.get('ob_strength', 1.5))

        # ... calculation logic ...

        df['ob_high']    = ...
        df['ob_low']     = ...
        df['ob_type']    = ...
        df['fvg_high']   = ... if show_fvg else np.nan
        df['fvg_low']    = ... if show_fvg else np.nan
        df['bos_signal'] = ... if show_bos else False
        df['bos_price']  = ... if show_bos else np.nan

    except Exception:
        for col in ['ob_high', 'ob_low', 'ob_type', 'fvg_high', 'fvg_low', 'bos_signal', 'bos_price']:
            df[col] = np.nan

    return df
```

### Available Imports (Allowed)

The following libraries are pre-approved for use in `calculate.py`:

```python
import pandas as pd          # ✅ Always available
import numpy as np           # ✅ Always available
import pandas_ta as ta       # ✅ Available (with PANDAS_TA_AVAILABLE guard)
import talib                 # ✅ Available (with TALIB_AVAILABLE guard)
from scipy import signal     # ✅ Available
import math                  # ✅ Standard library (safe)
import statistics            # ✅ Standard library (safe)
from typing import ...       # ✅ Standard library (safe)
from dataclasses import ...  # ✅ Standard library (safe)
```

---

## 7. Layer 3 — The Backend Plugin Registry

### File: `backend/services/strategy/indicator_registry.py`

```python
from pathlib import Path
from typing import Dict, List, Optional, Any
import importlib.util
import json
import logging
import pandas as pd

logger = logging.getLogger("indicator_registry")

INDICATORS_ROOT = Path(__file__).parents[3] / "indicators"


class IndicatorPlugin:
    """Represents a single loaded indicator plugin."""

    def __init__(self, manifest: dict, calculate_fn, plugin_dir: Path):
        self.id          = manifest["id"]
        self.version     = manifest.get("version", "0.0.0")
        self.label       = manifest["label"]
        self.kind        = manifest["kind"]           # "overlay" | "oscillator"
        self.license     = manifest.get("license", "builtin")
        self.pack_id     = manifest.get("pack_id")
        self.outputs     = manifest.get("outputs", [])
        self.params      = manifest.get("params", [])
        self.renderer    = manifest.get("renderer", "line")
        self.tags        = manifest.get("tags", [])
        self.min_candles = manifest.get("min_candles", 20)
        self.manifest    = manifest
        self._calculate  = calculate_fn
        self.plugin_dir  = plugin_dir

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        """Run the indicator's calculate() function safely."""
        try:
            return self._calculate(df, params)
        except Exception as e:
            logger.error(f"[{self.id}] calculate() raised: {e}", exc_info=True)
            # Fail safe: add NaN columns so downstream code doesn't crash
            for output in self.outputs:
                if output["name"] not in df.columns:
                    df[output["name"]] = float("nan")
            return df

    def to_catalog_entry(self) -> dict:
        """Serialize to the format returned by GET /api/v1/indicators/catalog."""
        return {
            "id":          self.id,
            "version":     self.version,
            "label":       self.label,
            "kind":        self.kind,
            "license":     self.license,
            "pack_id":     self.pack_id,
            "outputs":     self.outputs,
            "params":      self.params,
            "renderer":    self.renderer,
            "tags":        self.tags,
            "min_candles": self.min_candles,
        }


class IndicatorRegistry:
    """
    Loads, validates, and manages all indicator plugins.
    Singleton — instantiated once at gateway startup.
    """

    def __init__(self, indicators_root: Path = INDICATORS_ROOT):
        self._plugins: Dict[str, IndicatorPlugin] = {}
        self._active_licenses: set = set()  # pack_ids with valid licenses
        self._load_all(indicators_root)

    def _load_all(self, root: Path) -> None:
        """Scan all subdirectories for manifest.json + calculate.py pairs."""
        if not root.exists():
            logger.warning(f"Indicators root not found: {root}")
            return

        for manifest_path in sorted(root.rglob("manifest.json")):
            try:
                self._load_plugin(manifest_path)
            except Exception as e:
                logger.error(f"Failed to load plugin at {manifest_path}: {e}")

        logger.info(f"IndicatorRegistry: loaded {len(self._plugins)} plugins")

    def _load_plugin(self, manifest_path: Path) -> None:
        """Load a single plugin from its manifest.json."""
        plugin_dir = manifest_path.parent
        calculate_path = plugin_dir / "calculate.py"

        if not calculate_path.exists():
            raise FileNotFoundError(f"Missing calculate.py in {plugin_dir}")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self._validate_manifest(manifest)

        # Dynamically import the calculate module
        spec = importlib.util.spec_from_file_location(
            f"indicator_plugin.{manifest['id']}", calculate_path
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        if not hasattr(module, "calculate") or not callable(module.calculate):
            raise AttributeError(f"calculate.py in {plugin_dir} must define calculate(df, params)")

        plugin = IndicatorPlugin(manifest, module.calculate, plugin_dir)
        self._plugins[plugin.id] = plugin
        logger.debug(f"Loaded plugin: {plugin.id} v{plugin.version} [{plugin.license}]")

    def _validate_manifest(self, manifest: dict) -> None:
        """Validate required manifest fields."""
        required = ["id", "version", "label", "kind", "license", "outputs", "params", "renderer"]
        for field in required:
            if field not in manifest:
                raise ValueError(f"Manifest missing required field: '{field}'")
        if manifest["kind"] not in ("overlay", "oscillator"):
            raise ValueError(f"Invalid kind: {manifest['kind']}")
        for output in manifest.get("outputs", []):
            if output.get("type") not in ("numeric", "string", "boolean", "integer"):
                raise ValueError(f"Invalid output type: {output.get('type')}")

    # ── Public API ────────────────────────────────────────────────────────────

    def get(self, indicator_id: str) -> Optional[IndicatorPlugin]:
        return self._plugins.get(indicator_id)

    def list_all(self) -> List[IndicatorPlugin]:
        return list(self._plugins.values())

    def list_available(self, include_locked: bool = True) -> List[IndicatorPlugin]:
        """Return plugins the current user can use (license check)."""
        result = []
        for plugin in self._plugins.values():
            if plugin.license == "builtin":
                result.append(plugin)
            elif plugin.license in ("pack:free", "user"):
                result.append(plugin)
            elif plugin.license == "pack:premium":
                if plugin.pack_id in self._active_licenses or include_locked:
                    result.append(plugin)
        return result

    def activate_license(self, pack_id: str) -> None:
        """Mark a pack as licensed (called after license key validation)."""
        self._active_licenses.add(pack_id)

    def is_licensed(self, plugin: IndicatorPlugin) -> bool:
        if plugin.license in ("builtin", "pack:free", "user"):
            return True
        return plugin.pack_id in self._active_licenses

    def calculate(self, indicator_id: str, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        """Run a single indicator's calculation. Raises ValueError if not found."""
        plugin = self.get(indicator_id)
        if not plugin:
            raise ValueError(f"Unknown indicator: '{indicator_id}'")
        if not self.is_licensed(plugin):
            raise PermissionError(f"Indicator '{indicator_id}' requires a license for pack '{plugin.pack_id}'")
        return plugin.calculate(df, params)

    def reload_plugin(self, indicator_id: str) -> None:
        """Hot-reload a single plugin (for development / pack install)."""
        plugin = self.get(indicator_id)
        if plugin:
            self._load_plugin(plugin.plugin_dir / "manifest.json")

    def install_pack(self, pack_dir: Path) -> List[str]:
        """
        Install a new pack from an extracted directory.
        Returns list of newly registered indicator IDs.
        """
        installed = []
        for manifest_path in pack_dir.rglob("manifest.json"):
            self._load_plugin(manifest_path)
            with open(manifest_path) as f:
                manifest = json.load(f)
            installed.append(manifest["id"])
        return installed
```

### Registry Singleton (Gateway Lifespan)

The registry is instantiated **once** during gateway startup and injected as a dependency:

```python
# backend/services/gateway/main.py (lifespan addition)

from backend.services.strategy.indicator_registry import IndicatorRegistry

_registry: Optional[IndicatorRegistry] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _registry
    _registry = IndicatorRegistry()
    # ... existing lifespan code ...
    yield
    # ... cleanup ...

def get_registry() -> IndicatorRegistry:
    if _registry is None:
        raise RuntimeError("IndicatorRegistry not initialized")
    return _registry
```

---

## 8. Layer 4 — The Gateway Route (Refactored)

### What Changes

The refactored `indicators.py` route eliminates:
- `_map_params()` — params pass through directly, keyed by indicator ID
- Hardcoded `_build_series()` column lists — replaced by manifest-driven extraction
- `IndicatorSet` dataclass — no longer needed (DataFrame columns are dynamic)

### New `_calculate_in_thread()` Signature

```python
def _calculate_in_thread(
    csv_path: Path,
    asset: str,
    requested_indicators: List[str],   # list of indicator IDs
    params: Dict[str, Dict],           # { indicator_id: { param_name: value } }
    current_candle: Optional[Dict],
    timeframe_min: int,
    registry: IndicatorRegistry,
) -> Tuple[pd.DataFrame, Dict[str, list], int]:

    df = pd.read_csv(csv_path)
    # ... current_candle append logic (unchanged) ...

    pipeline = TechnicalIndicatorsPipeline()
    df = pipeline.resample_to_grid(df, timeframe=f'{timeframe_min}min')

    # Run each requested indicator through the registry
    for ind_id in requested_indicators:
        ind_params = params.get(ind_id, {})
        df = registry.calculate(ind_id, df, ind_params)

    # Build series from manifest-declared outputs (no hardcoded column lists)
    series = _build_series_from_registry(df, requested_indicators, registry)
    return df, series, len(df)
```

### New `_build_series_from_registry()`

```python
def _build_series_from_registry(
    result_df: pd.DataFrame,
    requested_indicators: List[str],
    registry: IndicatorRegistry,
) -> Dict[str, list]:
    """
    Build series dict using manifest output declarations.
    No hardcoded column lists — fully driven by manifests.
    """
    series: Dict[str, list] = {}
    extractors = {
        "numeric":  _extract_numeric,
        "string":   _extract_string,
        "boolean":  _extract_bool,
        "integer":  _extract_int,
    }

    for ind_id in requested_indicators:
        plugin = registry.get(ind_id)
        if not plugin:
            continue
        for output in plugin.outputs:
            col_name    = output["name"]
            output_type = output["type"]
            extractor   = extractors.get(output_type, _extract_numeric)
            series[col_name] = extractor(result_df, col_name)

    return series
```

### Backward Compatibility

The response envelope is **unchanged**:

```json
{
  "ok": true,
  "asset": "EURUSD",
  "timeframe": 1,
  "series": { ... },
  "count": 500
}
```

The `series` dict now contains only the columns for the requested indicators (not all columns), which is actually more efficient than the current approach.

---

## 9. Layer 5 — The Frontend Renderer Registry

### The Problem with the Current Approach

`useOverlayIndicators.js` currently has this pattern:

```js
if (type === 'ema_cross') {
  // 30 lines of rendering logic
} else if (type === 'support_resistance') {
  // 40 lines of rendering logic
} else if (type === 'bollinger_bands') {
  // 20 lines of rendering logic
}
// ... etc
```

This is a **closed system** — adding a new indicator requires editing this file.

### The Renderer Registry Pattern

```
gui/Dashboard/src/indicators/
  renderers/
    LineRenderer.js          ← single line (EMA, SMA, etc.)
    MultiLineRenderer.js     ← multiple lines (EMA Cross, MACD)
    BandRenderer.js          ← upper/lower/middle (Bollinger Bands)
    BoxSeriesRenderer.js     ← filled boxes (S/R zones, Order Blocks)
    HistogramRenderer.js     ← bar histogram (MACD histogram, volume)
    OscillatorRenderer.js    ← oscillator with overbought/oversold levels
    ArrowRenderer.js         ← up/down arrows on price (signals)
  RendererRegistry.js        ← maps renderer name → renderer class
  index.js                   ← exports
```

### Renderer Interface Contract

Every renderer implements this interface:

```js
// BaseRenderer.js
export class BaseRenderer {
  /**
   * @param {IChartApi} chart - Lightweight Charts chart instance
   * @param {object} indicator - { id, manifest, params, seriesData }
   * @param {object} options - { colors, theme }
   * @returns {Array} - array of created series (for cleanup)
   */
  render(chart, indicator, options) {
    throw new Error('render() must be implemented');
  }

  /**
   * Called when indicator is removed or params change.
   * @param {Array} series - series returned by render()
   */
  cleanup(series) {
    series.forEach(s => {
      try { chart.removeSeries(s); } catch {}
    });
  }

  /**
   * Called on every new candle (real-time update).
   * Default: full re-render. Override for incremental updates.
   */
  update(series, newDataPoint) {
    // Default: no-op (full re-render handles it)
  }
}
```

### Renderer Registry

```js
// RendererRegistry.js
import { LineRenderer }       from './renderers/LineRenderer';
import { MultiLineRenderer }  from './renderers/MultiLineRenderer';
import { BandRenderer }       from './renderers/BandRenderer';
import { BoxSeriesRenderer }  from './renderers/BoxSeriesRenderer';
import { HistogramRenderer }  from './renderers/HistogramRenderer';
import { OscillatorRenderer } from './renderers/OscillatorRenderer';
import { ArrowRenderer }      from './renderers/ArrowRenderer';

const BUILTIN_RENDERERS = {
  'line':        LineRenderer,
  'multi_line':  MultiLineRenderer,
  'band':        BandRenderer,
  'box_series':  BoxSeriesRenderer,
  'histogram':   HistogramRenderer,
  'oscillator':  OscillatorRenderer,
  'arrow':       ArrowRenderer,
};

const _custom_renderers = {};  // dynamically loaded from pack renderer.js files

export const RendererRegistry = {
  get(rendererName) {
    return BUILTIN_RENDERERS[rendererName]
        || _custom_renderers[rendererName]
        || LineRenderer;  // safe fallback
  },

  async loadCustomRenderer(packId, rendererUrl) {
    try {
      const module = await import(/* @vite-ignore */ rendererUrl);
      _custom_renderers[packId] = module.default;
    } catch (e) {
      console.warn(`Failed to load custom renderer for ${packId}:`, e);
    }
  },
};
```

### Refactored `useOverlayIndicators.js`

The entire `if/else` chain is replaced by:

```js
import { RendererRegistry } from '../indicators/RendererRegistry';

// For each active overlay indicator:
const RendererClass = RendererRegistry.get(indicator.manifest.renderer);
const renderer = new RendererClass();
const series = renderer.render(chart, {
  id:         indicator.id,
  manifest:   indicator.manifest,
  params:     indicator.params,
  seriesData: indicatorSeriesData[indicator.id],
}, { colors: theme.colors });

// Store series refs for cleanup
seriesRefs.current[indicator.id] = { renderer, series };
```

---

## 10. Layer 6 — Dynamic Catalog API

### Endpoint: `GET /api/v1/indicators/catalog`

Returns the full list of available indicators with their manifests. The frontend uses this to build the indicator picker dynamically.

**Response:**

```json
{
  "ok": true,
  "catalog": [
    {
      "id": "ema_cross",
      "version": "1.0.0",
      "label": "EMA Cross-Over",
      "kind": "overlay",
      "license": "builtin",
      "pack_id": null,
      "locked": false,
      "outputs": [...],
      "params": [
        { "name": "fast", "label": "Fast EMA Period", "type": "number", "min": 1, "max": 500, "default": 21 },
        ...
      ],
      "renderer": "multi_line",
      "tags": ["trend", "ema"],
      "min_candles": 100
    },
    {
      "id": "smart_money_concepts",
      "version": "1.2.0",
      "label": "Smart Money Concepts",
      "kind": "overlay",
      "license": "pack:premium",
      "pack_id": "smc_pack_v1",
      "locked": true,
      "outputs": [...],
      "params": [...],
      "renderer": "box_series",
      "tags": ["smart_money", "price_action"]
    }
  ],
  "total": 18,
  "licensed_packs": ["smc_pack_v1"]
}
```

**Key field:** `locked: true` means the indicator is visible in the catalog but requires a license to use. The frontend shows a 🔒 badge and a "Purchase" CTA.

### Frontend: Dynamic `indicatorOptions`

`chartOptions.js` is replaced by a Zustand store action:

```js
// indicatorStore.js (new store)
const useIndicatorStore = create((set, get) => ({
  catalog: [],
  catalogLoaded: false,

  fetchCatalog: async () => {
    const res = await fetch('/api/v1/indicators/catalog');
    const data = await res.json();
    set({ catalog: data.catalog, catalogLoaded: true });
  },

  // Returns the manifest for a given indicator ID
  getManifest: (indicatorId) => {
    return get().catalog.find(c => c.id === indicatorId) || null;
  },
}));
```

`ChartHeader.jsx` reads from `indicatorStore.catalog` instead of the static `indicatorOptions` array.

---

## 11. Layer 7 — Licensing & Pack Management

### Pack Management Endpoints

```
GET  /api/v1/indicator-packs
     → List all installed packs with status (active/locked/available)

POST /api/v1/indicator-packs/install
     Body: multipart/form-data { pack_file: <zip> }
     → Upload and install a pack zip file
     → Validates manifest + calculate.py before installing
     → Returns { ok, installed_indicators: [...] }

POST /api/v1/indicator-packs/activate
     Body: { pack_id: "smc_pack_v1", license_key: "XXXX-XXXX-XXXX" }
     → Validates license key (local hash check or remote validation)
     → Activates the pack for the current user
     → Returns { ok, pack_id, activated_indicators: [...] }

DELETE /api/v1/indicator-packs/{pack_id}
     → Uninstall a pack (removes files, unloads from registry)
     → Cannot uninstall "builtin" packs

GET /api/v1/indicator-packs/status
     → Returns { licensed_packs: [...], installed_packs: [...] }
```

### Pack File Format

A pack is distributed as a **zip file** with this structure:

```
smc_pack_v1.qflx-pack
├── pack.json              ← pack-level metadata (name, version, included indicators)
├── smart_money_concepts/
│   ├── manifest.json
│   ├── calculate.py
│   └── renderer.js        ← optional
├── liquidity_sweep/
│   ├── manifest.json
│   └── calculate.py
└── README.md
```

The `.qflx-pack` extension is just a renamed zip. The backend validates:
1. `pack.json` exists and is valid
2. Every subdirectory has a valid `manifest.json` + `calculate.py`
3. No `calculate.py` imports forbidden modules (AST scan)
4. No filename traversal attacks (path sanitization)

### License Key Validation

Two modes supported:

**Mode A — Offline (Hash-Based)**
```python
import hashlib, hmac

PACK_SECRET = os.environ.get("QFLX_PACK_SECRET", "")

def validate_license_key(pack_id: str, license_key: str) -> bool:
    expected = hmac.new(
        PACK_SECRET.encode(),
        f"{pack_id}:{license_key}".encode(),
        hashlib.sha256
    ).hexdigest()[:16].upper()
    return hmac.compare_digest(license_key.upper(), expected)
```

**Mode B — Online (API Validation)**
```python
async def validate_license_key_online(pack_id: str, license_key: str) -> bool:
    async with aiohttp.ClientSession() as session:
        resp = await session.post(
            "https://licenses.qflx.io/validate",
            json={"pack_id": pack_id, "key": license_key}
        )
        data = await resp.json()
        return data.get("valid", False)
```

### Pack Store UI (New Panel)

A new `IndicatorStorePanel.jsx` component:

```
┌─────────────────────────────────────────────────────┐
│  🧩 Indicator Store                                  │
├─────────────────────────────────────────────────────┤
│  [Installed] [Available] [My Indicators]             │
├─────────────────────────────────────────────────────┤
│  ✅ EMA Cross-Over          builtin    [Active]      │
│  ✅ Support & Resistance    builtin    [Active]      │
│  ✅ Smart Money Concepts    premium    [Active]      │
│  🔒 Wyckoff Phases          premium    [Purchase]    │
│  🔒 ICT Concepts            premium    [Purchase]    │
│  📦 My Custom RSI           user       [Active]      │
├─────────────────────────────────────────────────────┤
│  [+ Install Pack (.qflx-pack)]  [Enter License Key] │
└─────────────────────────────────────────────────────┘
```

---

## 12. Layer 8 — User-Written Indicators

### Two Tiers of User Indicators

#### Tier 1 — Formula DSL (No-Code)

A JSON-based formula language for simple indicators. Covers ~80% of user needs without Python knowledge.

```json
{
  "id": "my_ema_ribbon",
  "label": "My EMA Ribbon",
  "kind": "overlay",
  "license": "user",
  "formula": {
    "ema_r_fast":  { "fn": "ema",  "source": "close", "period": "$fast" },
    "ema_r_med":   { "fn": "ema",  "source": "close", "period": "$med" },
    "ema_r_slow":  { "fn": "ema",  "source": "close", "period": "$slow" },
    "ema_r_trend": { "fn": "gt",   "a": "ema_r_fast", "b": "ema_r_slow" }
  },
  "outputs": [
    { "name": "ema_r_fast",  "type": "numeric" },
    { "name": "ema_r_med",   "type": "numeric" },
    { "name": "ema_r_slow",  "type": "numeric" },
    { "name": "ema_r_trend", "type": "boolean" }
  ],
  "params": [
    { "name": "fast",  "label": "Fast Period",  "type": "number", "default": 8 },
    { "name": "med",   "label": "Med Period",   "type": "number", "default": 21 },
    { "name": "slow",  "label": "Slow Period",  "type": "number", "default": 55 }
  ],
  "renderer": "multi_line"
}
```

**Supported DSL functions:**

| Function | Description |
|---|---|
| `ema` | Exponential Moving Average |
| `sma` | Simple Moving Average |
| `wma` | Weighted Moving Average |
| `rsi` | RSI |
| `atr` | ATR |
| `highest` | Rolling max |
| `lowest` | Rolling min |
| `diff` | Difference from previous bar |
| `pct_change` | Percentage change |
| `gt`, `lt`, `gte`, `lte` | Comparison (returns boolean) |
| `add`, `sub`, `mul`, `div` | Arithmetic |
| `abs` | Absolute value |
| `cross_above`, `cross_below` | Crossover detection |

#### Tier 2 — Python Upload (Power Users)

Users upload a zip containing `manifest.json` + `calculate.py`. The backend:

1. **AST Scan** — parses `calculate.py` with Python's `ast` module, rejects any import of forbidden modules
2. **Signature Check** — verifies `calculate(df, params)` function exists
3. **Sandbox Test Run** — runs `calculate()` on a small synthetic DataFrame in a restricted environment
4. **Output Validation** — verifies all declared `outputs` columns are actually added to the DataFrame

```python
# backend/services/strategy/indicator_validator.py

import ast
from pathlib import Path

FORBIDDEN_IMPORTS = {
    'os', 'sys', 'subprocess', 'socket', 'requests', 'httpx',
    'aiohttp', 'urllib', 'ftplib', 'smtplib', 'shutil',
    'pickle', 'shelve', 'sqlite3', 'builtins', '__import__',
}

def validate_calculate_py(source_code: str) -> list[str]:
    """
    Returns list of violation strings. Empty list = safe.
    """
    violations = []
    try:
        tree = ast.parse(source_code)
    except SyntaxError as e:
        return [f"Syntax error: {e}"]

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            module = (
                node.names[0].name if isinstance(node, ast.Import)
                else (node.module or "")
            ).split(".")[0]
            if module in FORBIDDEN_IMPORTS:
                violations.append(f"Forbidden import: '{module}'")

        # Block exec() and eval()
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in ('exec', 'eval', 'compile', '__import__'):
                violations.append(f"Forbidden call: '{node.func.id}()'")

    return violations
```

### User Indicator Upload Endpoint

```
POST /api/v1/indicator-packs/upload-user
     Body: multipart/form-data { pack_file: <zip> }
     → Validates manifest + calculate.py (AST scan + test run)
     → Installs to indicators/user/{indicator_id}/
     → Returns { ok, indicator_id, warnings: [...] }
```

---

## 13. File & Folder Structure

### Backend

```
backend/
  services/
    strategy/
      indicators.py              ← REFACTORED: thin orchestrator, calls registry
      indicator_registry.py      ← NEW: IndicatorRegistry + IndicatorPlugin classes
      indicator_validator.py     ← NEW: AST scanner + sandbox test runner
      formula_interpreter.py     ← NEW: DSL formula evaluator (Tier 1 user indicators)
    gateway/
      routes/
        indicators.py            ← REFACTORED: uses registry, no _map_params()
        indicator_packs.py       ← NEW: pack install/activate/list endpoints

indicators/                      ← NEW: root of all indicator plugins
  builtin/
    ema_cross/
      manifest.json
      calculate.py
    support_resistance/
      manifest.json
      calculate.py
    bollinger_bands/
      manifest.json
      calculate.py
    supertrend/
      manifest.json
      calculate.py
    rsi/
      manifest.json
      calculate.py
    macd_histogram/
      manifest.json
      calculate.py
    stoch/
      manifest.json
      calculate.py
    cci/
      manifest.json
      calculate.py
    adx/
      manifest.json
      calculate.py
    atr/
      manifest.json
      calculate.py
    demarker/
      manifest.json
      calculate.py
    schaff_tc/
      manifest.json
      calculate.py
    williams_r/
      manifest.json
      calculate.py
    roc/
      manifest.json
      calculate.py
    ema/
      manifest.json
      calculate.py
  packs/                         ← installed premium/free packs
    .gitkeep
  user/                          ← user-uploaded indicators
    .gitkeep
```

### Frontend

```
gui/Dashboard/src/
  indicators/                    ← NEW: indicator plugin frontend layer
    renderers/
      BaseRenderer.js
      LineRenderer.js
      MultiLineRenderer.js
      BandRenderer.js
      BoxSeriesRenderer.js
      HistogramRenderer.js
      OscillatorRenderer.js
      ArrowRenderer.js
    RendererRegistry.js
    index.js
  store/
    indicatorStore.js            ← NEW: catalog state + fetchCatalog()
  components/
    IndicatorStorePanel.jsx      ← NEW: pack management UI
    IndicatorSettingsModal.jsx   ← UNCHANGED (already dynamic from paramConfig)
    ChartHeader.jsx              ← MODIFIED: reads from indicatorStore.catalog
  hooks/
    useOverlayIndicators.js      ← REFACTORED: uses RendererRegistry
    useChartWorkspaceIndicators.js ← MINOR: reads manifest from indicatorStore
  config/
    chartOptions.js              ← DEPRECATED: kept for fallback only
```

---

## 14. Full API Specification

### Existing Endpoint (Unchanged Contract)

```
POST /api/v1/indicators
Body: {
  "asset": "EURUSD",
  "timeframe": "5m",
  "indicators": ["ema_cross", "rsi", "support_resistance"],
  "params": {
    "ema_cross": { "fast": 21, "med": 50, "slow": 100 },
    "rsi": { "period": 14 },
    "support_resistance": { "period": 5 }
  },
  "current_candle": { ... }   // optional
}

Response: {
  "ok": true,
  "asset": "EURUSD",
  "timeframe": 5,
  "series": {
    "ema_cross_fast": [...],
    "ema_cross_med": [...],
    "ema_cross_slow": [...],
    "rsi_14": [...],
    "support_level": [...],
    ...
  },
  "count": 500
}
```

> ⚠️ **Breaking change note:** In v3, `params` keys change from the current mixed format (e.g. `"ema_cross"`, `"rsi"`) to always use the indicator `id` from the manifest. The current `_map_params()` already handles `"ema_cross"` and `"rsi"` — so this is backward compatible for existing indicators.

### New Endpoints

```
GET  /api/v1/indicators/catalog
     → Full catalog with manifests (see Section 10)

GET  /api/v1/indicator-packs
     → { packs: [{ id, name, version, status, indicators: [...] }] }

POST /api/v1/indicator-packs/install
     → Install from zip upload

POST /api/v1/indicator-packs/activate
     → Activate with license key

DELETE /api/v1/indicator-packs/{pack_id}
     → Uninstall pack

POST /api/v1/indicator-packs/upload-user
     → Upload user-written indicator

GET  /api/v1/indicator-packs/status
     → { licensed_packs: [...], installed_packs: [...] }
```

---

## 15. Data Contracts & Schemas

### Manifest JSON Schema (Pydantic — for validation)

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional, List
from enum import Enum

class OutputType(str, Enum):
    numeric = "numeric"
    string  = "string"
    boolean = "boolean"
    integer = "integer"

class IndicatorOutput(BaseModel):
    name:  str
    type:  OutputType
    label: str

class ParamType(str, Enum):
    number  = "number"
    boolean = "boolean"
    select  = "select"

class IndicatorParam(BaseModel):
    name:    str
    label:   str
    type:    ParamType
    default: Any
    min:     Optional[float] = None
    max:     Optional[float] = None
    step:    Optional[float] = None
    options: Optional[List[str]] = None  # for "select" type

class LicenseType(str, Enum):
    builtin      = "builtin"
    pack_free    = "pack:free"
    pack_premium = "pack:premium"
    user         = "user"

class IndicatorManifest(BaseModel):
    id:               str = Field(pattern=r'^[a-z][a-z0-9_]*$')
    version:          str
    label:            str
    description:      Optional[str] = None
    author:           str
    license:          LicenseType
    pack_id:          Optional[str] = None
    min_app_version:  Optional[str] = None
    kind:             Literal["overlay", "oscillator"]
    outputs:          List[IndicatorOutput]
    params:           List[IndicatorParam]
    renderer:         str
    tags:             List[str] = []
    min_candles:      int = 20
```

### Pack Metadata Schema (`pack.json`)

```json
{
  "id": "smc_pack_v1",
  "name": "Smart Money Concepts Pack",
  "version": "1.2.0",
  "author": "QuFLX Labs",
  "description": "Institutional-grade SMC indicators: Order Blocks, FVGs, BOS, CHoCH",
  "license": "pack:premium",
  "price_usd": 29.99,
  "indicators": [
    "smart_money_concepts",
    "liquidity_sweep",
    "market_structure"
  ],
  "min_app_version": "3.0.0",
  "changelog": {
    "1.2.0": "Added CHoCH detection",
    "1.1.0": "Improved FVG accuracy",
    "1.0.0": "Initial release"
  }
}
```

---

## 16. Migration Plan (v2 → v3)

The migration is designed so **each phase is independently deployable** and v2 functionality is never broken.

---

### Phase 1 — Manifest-ify the Builtins
**Risk: Zero. Zero user-visible change.**

**Goal:** Extract all 15 existing indicators into the plugin folder structure without changing any behavior.

**Steps:**
1. Create `indicators/builtin/` directory structure
2. For each existing indicator in `TechnicalIndicatorsPipeline`:
   - Create `indicators/builtin/{id}/manifest.json` (copy params from `chartOptions.js`)
   - Create `indicators/builtin/{id}/calculate.py` (extract the `_calculate_*()` method body)
3. Create `IndicatorRegistry` class (loads manifests, calls `calculate.py` modules)
4. Modify `TechnicalIndicatorsPipeline.calculate_indicators()` to call the registry instead of hardcoded methods
5. Keep `_map_params()` and `_build_series()` working as-is (Phase 2 removes them)
6. Run full backend test suite — all 127 tests must pass

**Files changed:** `indicators/` (new), `indicator_registry.py` (new), `indicators.py` (strategy, minor refactor)  
**Files unchanged:** All gateway routes, all frontend files

---

### Phase 2 — Dynamic Catalog & Param Passthrough
**Risk: Low. Backend-only change.**

**Goal:** Eliminate `_map_params()` and hardcoded `_build_series()` column lists.

**Steps:**
1. Add `GET /api/v1/indicators/catalog` endpoint
2. Refactor `_calculate_in_thread()` to use registry directly
3. Replace `_build_series()` with `_build_series_from_registry()`
4. Remove `_map_params()` (params now pass through directly by indicator ID)
5. Update `useChartWorkspaceIndicators.js` to use indicator `id` as param key (already correct for most indicators)
6. Add `indicatorStore.js` to frontend — fetch catalog on app startup
7. Update `ChartHeader.jsx` to read from `indicatorStore.catalog` instead of static `indicatorOptions`
8. Keep `chartOptions.js` as a fallback for offline/loading state

**Files changed:** `indicators.py` (gateway route), `indicatorStore.js` (new), `ChartHeader.jsx` (minor)  
**Files unchanged:** `useOverlayIndicators.js`, `OscillatorChart.jsx`, all rendering code

---

### Phase 3 — Renderer Registry
**Risk: Medium. Frontend rendering refactor.**

**Goal:** Replace hardcoded `if/else` rendering chains with the renderer registry.

**Steps:**
1. Create `gui/Dashboard/src/indicators/renderers/` directory
2. Extract each rendering branch from `useOverlayIndicators.js` into its own renderer class
3. Create `RendererRegistry.js`
4. Refactor `useOverlayIndicators.js` to use `RendererRegistry.get(manifest.renderer)`
5. Refactor `OscillatorChart.jsx` similarly
6. Visual regression test: verify all 15 indicators render identically to v2

**Files changed:** `useOverlayIndicators.js`, `OscillatorChart.jsx`, new `indicators/` directory  
**Files unchanged:** All backend files

---

### Phase 4 — Pack Management & User Indicators
**Risk: Medium. New features only — no changes to existing code paths.**

**Goal:** Enable pack install/uninstall, license activation, and user-uploaded indicators.

**Steps:**
1. Add `indicator_packs.py` gateway route (install, activate, list, delete)
2. Add `indicator_validator.py` (AST scanner + sandbox test)
3. Add `formula_interpreter.py` (DSL evaluator for Tier 1 user indicators)
4. Add `IndicatorStorePanel.jsx` UI component
5. Add license key validation (offline hash mode first, online mode later)
6. Add pack zip upload + extraction + validation flow

**Files changed:** New files only (no existing files modified)

---

### Migration Checklist

```
Phase 1 — Manifest-ify Builtins
- [ ] Create indicators/builtin/ directory structure (15 indicator folders)
- [ ] Write manifest.json for each builtin indicator
- [ ] Extract calculate.py for each builtin indicator
- [ ] Implement IndicatorRegistry class
- [ ] Refactor TechnicalIndicatorsPipeline to use registry
- [ ] Run backend tests (127/127 must pass)

Phase 2 — Dynamic Catalog
- [ ] Add GET /api/v1/indicators/catalog endpoint
- [ ] Refactor _calculate_in_thread() to use registry
- [ ] Replace _build_series() with manifest-driven extraction
- [ ] Remove _map_params()
- [ ] Add indicatorStore.js
- [ ] Update ChartHeader.jsx to use catalog
- [ ] Integration test: all 15 indicators load and render correctly

Phase 3 — Renderer Registry
- [ ] Create BaseRenderer.js interface
- [ ] Implement 7 renderer classes
- [ ] Create RendererRegistry.js
- [ ] Refactor useOverlayIndicators.js
- [ ] Refactor OscillatorChart.jsx
- [ ] Visual regression test: all indicators render identically

Phase 4 — Pack Management
- [ ] Add indicator_packs.py route
- [ ] Add indicator_validator.py (AST scanner)
- [ ] Add formula_interpreter.py (DSL)
- [ ] Add IndicatorStorePanel.jsx
- [ ] Add license key validation
- [ ] End-to-end test: install pack → activate license → indicator appears in chart
```

---

## 17. Security Model

### User-Uploaded Code (Critical)

User-uploaded `calculate.py` files are the primary attack surface. Defense in depth:

| Layer | Mechanism | What It Prevents |
|---|---|---|
| **L1 — AST Scan** | Parse with `ast` module, reject forbidden imports | Network calls, filesystem access, subprocess spawning |
| **L2 — Sandbox Test Run** | Run on synthetic DataFrame with `resource` limits (Linux) or `concurrent.futures` timeout (Windows) | Infinite loops, excessive memory |
| **L3 — Column Isolation** | Plugin can only add columns declared in manifest | Overwriting OHLCV data or other indicators' columns |
| **L4 — Exception Isolation** | `IndicatorPlugin.calculate()` wraps in try/except | Crashing the gateway on bad user code |
| **L5 — No Persistence** | `calculate()` receives a copy of the DataFrame | Cannot persist state between calls |

### Pack File Validation

```python
def validate_pack_zip(zip_path: Path) -> list[str]:
    """Returns list of security violations. Empty = safe."""
    violations = []
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            # Path traversal attack prevention
            if ".." in name or name.startswith("/"):
                violations.append(f"Path traversal attempt: {name}")
            # No executable files
            if name.endswith((".exe", ".sh", ".bat", ".ps1")):
                violations.append(f"Executable file not allowed: {name}")
    return violations
```

### License Key Security

- License keys are validated server-side only — never exposed to the frontend
- HMAC-SHA256 with a server-side secret (`QFLX_PACK_SECRET` env var)
- Keys are stored hashed in `data/licenses.json` (never plaintext)
- Rate limiting on `/activate` endpoint (5 attempts per hour per IP)

---

## 18. Testing Strategy

### Backend Tests

```
backend/tests/
  test_indicator_registry.py
    - test_load_all_builtins()          → all 15 builtin plugins load without error
    - test_manifest_validation()        → invalid manifests raise ValueError
    - test_calculate_contract()         → calculate() adds declared columns, doesn't modify existing
    - test_license_enforcement()        → premium indicator raises PermissionError without license
    - test_hot_reload()                 → reload_plugin() updates the calculate function
    - test_install_pack()               → install_pack() registers new indicators

  test_indicator_validator.py
    - test_forbidden_import_os()        → rejects 'import os'
    - test_forbidden_import_requests()  → rejects 'import requests'
    - test_forbidden_exec()             → rejects 'exec()'
    - test_valid_calculate_passes()     → clean calculate.py passes validation
    - test_syntax_error_caught()        → syntax errors return violation list

  test_indicators_route_v3.py
    - test_catalog_endpoint()           → GET /catalog returns all builtins
    - test_calculate_with_registry()    → POST /indicators uses registry correctly
    - test_unknown_indicator_404()      → unknown indicator_id returns 400
    - test_params_passthrough()         → params reach calculate() unchanged
    - test_cache_invalidation()         → param change causes cache miss
```

### Frontend Tests

```
src/__tests__/
  RendererRegistry.test.js
    - test_get_builtin_renderer()       → returns correct class for known names
    - test_fallback_to_line()           → unknown renderer name returns LineRenderer
    - test_load_custom_renderer()       → async import of custom renderer.js

  indicatorStore.test.js
    - test_fetch_catalog()              → populates catalog from API response
    - test_get_manifest()               → returns correct manifest by ID
    - test_locked_indicators()          → locked indicators have locked:true
```

---

## 19. Pine Script — Why It Doesn't Apply

**Lightweight Charts is a rendering library, not a scripting platform.**

| | TradingView | QuFLX |
|---|---|---|
| **Chart Library** | Lightweight Charts (open source) | Lightweight Charts (same) |
| **Indicator Runtime** | TradingView servers (proprietary) | QuFLX backend (Python) |
| **Scripting Language** | Pine Script (proprietary, closed) | Python (open, standard) |
| **Execution** | Server-side on TradingView | In-process via `asyncio.to_thread()` |

Pine Script is a **server-side language** that runs on TradingView's infrastructure. It is not portable, not open-source, and has no public runtime. Lightweight Charts only receives pre-calculated series data — it has no concept of indicator logic.

**The QuFLX plugin system is actually more powerful than Pine Script** for this use case:
- Full Python ecosystem available (`pandas`, `numpy`, `scipy`, `pandas_ta`, `talib`)
- No sandboxed API limitations
- Direct access to raw OHLCV DataFrames
- Can use ML models, external data, complex algorithms
- No per-indicator execution limits

The equivalent of Pine Script in the QuFLX system is the **Formula DSL** (Section 12, Tier 1) — a simple JSON-based formula language for users who don't know Python.

---

## 20. Decision Log

| Decision | Rationale | Alternatives Considered |
|---|---|---|
| **Manifest + calculate.py** (not class inheritance) | Simplest possible contract. No framework knowledge required. Pure function. | Plugin base class (more complex, harder to validate), YAML config (less expressive) |
| **Filesystem-based plugin discovery** (not database) | Zero infrastructure dependency. Works offline. Easy to inspect/debug. | SQLite registry (adds dependency), Redis (overkill) |
| **Params pass through directly** (no `_map_params()`) | Each plugin owns its param names. No central mapping to maintain. | Keep `_map_params()` (doesn't scale), auto-mapping by convention (fragile) |
| **Manifest-driven `_build_series()`** | Adding a new output column requires only manifest change, not code change. | Keep hardcoded lists (doesn't scale), reflection-based (fragile) |
| **Renderer registry** (not if/else chain) | Open/closed principle — new renderers don't require editing existing code. | Keep if/else (doesn't scale), React component per indicator (too heavy) |
| **AST scan for user code** (not full sandbox) | Fast, zero dependencies, catches 99% of attack vectors. Full sandboxing (Docker, Pyodide) is overkill for this use case. | Docker container per calculation (too slow), Pyodide WASM (browser-only) |
| **Phase 1 first** (manifest-ify builtins before new features) | Zero risk. Establishes the foundation. Proves the architecture works before building on it. | Big bang rewrite (high risk), feature-first (unstable foundation) |

---

*Document version: 1.0.0 — 2026-03-16*  
*Next review: When Phase 1 implementation begins*
