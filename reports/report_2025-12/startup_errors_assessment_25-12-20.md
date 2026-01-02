# Startup Errors Assessment Report
**Date:** 2025-12-20  
**Status:** Assessment Complete  
**Author:** @Cline

---

## Executive Summary

After PC restart, three distinct issues prevent the system from functioning correctly:

| Issue # | Severity | Component | Description |
|---------|----------|-----------|-------------|
| 1 | 🟡 Warning | Gateway | FastAPI `on_event` deprecation warnings |
| 2 | 🟡 Warning | Collector | FastAPI `on_event` deprecation warnings |
| 3 | 🔴 Critical | Frontend | `useMarketStore` export/import mismatch causes blank page |

---

## Issue 1: Gateway Deprecation Warnings

### Location
`backend/services/gateway/main.py` (lines 86-95)

### Symptom
```
DeprecationWarning: on_event is deprecated, use lifespan event handlers instead.
```

### Root Cause
FastAPI's `@app.on_event("startup")` and `@app.on_event("shutdown")` decorators are deprecated in favor of the new `lifespan` context manager pattern.

### Current Code (Deprecated)
```python
@app.on_event("startup")
async def startup_event():
    # ... startup logic

@app.on_event("shutdown")
async def shutdown_event():
    # ... shutdown logic
```

### Recommended Fix (Modern Pattern)
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting API Gateway...")
    global redis_client
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    asyncio.create_task(redis_listener())
    
    yield  # Application runs here
    
    # Shutdown
    logger.info("Shutting down API Gateway...")
    if redis_client:
        await redis_client.close()

app = FastAPI(title="QuFLX v2 API Gateway", lifespan=lifespan)
```

### Impact
- **Currently**: Warnings only, functionality intact
- **Future**: Will break in FastAPI 1.0+ when deprecated decorators are removed

---

## Issue 2: Collector Deprecation Warnings

### Location
`backend/services/collector/main.py`

### Symptom
Similar deprecation warnings expected (though not shown in user's output).

### Analysis
After reviewing `collector/main.py`, I found this file does **NOT** use FastAPI at all - it's a standalone service using `signal` handlers. **No deprecation warning should occur from this file.**

If warnings appear, they may originate from imported dependencies. The collector is clean.

### Status
✅ **No action required for collector/main.py**

---

## Issue 3: Frontend Blank Page (CRITICAL)

### Location
`gui/Dashboard/src/components/StatusIndicator.jsx` (line 2)

### Symptom
```
Uncaught SyntaxError: The requested module '/src/store/marketStore.js' 
does not provide an export named 'useMarketStore'
```

### Root Cause
**Export/Import Mismatch:**

| File | Pattern | Type |
|------|---------|------|
| `marketStore.js` | `export default useMarketStore` | Default export |
| `StatusIndicator.jsx` | `import { useMarketStore }` | Named import ❌ |

ES Modules require exact matching:
- Default export → `import useMarketStore from '...'`
- Named export → `import { useMarketStore } from '...'`

### Files Using Correct Import (7 files)
✅ `useStreamHealth.js` - `import useMarketStore from '../store/marketStore';`  
✅ `AutomationsPanel.jsx` - `import useMarketStore from '../store/marketStore';`  
✅ `AssetPanel.jsx` - `import useMarketStore from '../store/marketStore';`  
✅ `ChartWorkspace.jsx` - `import useMarketStore from '../store/marketStore';`  
✅ `TopBar.jsx` - `import useMarketStore from '../store/marketStore';`  
✅ `Sidebar.jsx` - `import useMarketStore from '../store/marketStore';`  
✅ `Dashboard.jsx` - `import useMarketStore from '../store/marketStore';`  

### File Using Incorrect Import (1 file)
❌ `StatusIndicator.jsx` - `import { useMarketStore } from '../store/marketStore';`

### Additional Issue in StatusIndicator.jsx
**TypeScript Syntax in JSX File:**
```jsx
const [lastCheck, setLastCheck] = useState<Date | null>(null);  // TS syntax in .jsx!
```
This may cause parsing issues depending on build configuration.

### Recommended Fix
```jsx
// StatusIndicator.jsx - Line 2
// BEFORE (wrong):
import { useMarketStore } from '../store/marketStore';

// AFTER (correct):
import useMarketStore from '../store/marketStore';

// Also fix TypeScript syntax (line 7):
// BEFORE:
const [lastCheck, setLastCheck] = useState<Date | null>(null);
// AFTER:
const [lastCheck, setLastCheck] = useState(null);
```

---

## Action Plan

### Priority 1: Fix Frontend (Immediate - Blocking)

**File:** `gui/Dashboard/src/components/StatusIndicator.jsx`

| Line | Current | Fix |
|------|---------|-----|
| 2 | `import { useMarketStore }` | `import useMarketStore` |
| 7 | `useState<Date \| null>(null)` | `useState(null)` |

**Estimated Time:** 2 minutes  
**Risk Level:** None - simple import fix

### Priority 2: Fix Gateway Deprecation (Non-Blocking)

**File:** `backend/services/gateway/main.py`

1. Add `asynccontextmanager` import
2. Create `lifespan()` context manager
3. Move startup logic to before `yield`
4. Move shutdown logic to after `yield`
5. Pass `lifespan` to FastAPI constructor

**Estimated Time:** 10 minutes  
**Risk Level:** Low - well-documented pattern

### Priority 3: Verify Collector (Already Clean)

**File:** `backend/services/collector/main.py`

✅ No FastAPI used - no deprecation warnings expected  
✅ Uses proper `signal` handlers for shutdown

---

## Success Criteria

| Check | Expected Result |
|-------|-----------------|
| Gateway starts | No deprecation warnings |
| Collector starts | No deprecation warnings |
| Frontend loads | Dashboard renders, no console errors |
| Status Indicator | Shows backend status correctly |

---

## Conclusion

The **critical blocking issue** is a simple one-line fix in `StatusIndicator.jsx`. The deprecation warnings are cosmetic and non-blocking but should be addressed to ensure future compatibility with FastAPI 1.0+.

**Recommended Next Step:** Fix `StatusIndicator.jsx` first to restore frontend functionality, then migrate Gateway to lifespan pattern.
