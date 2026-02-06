# Token Usage Reduction Assessment Report

**Date:** 2026-02-06  
**Source:** Grok API Token Usage Optimization Recommendations + QuFLX v2 Codebase Analysis

---

## Executive Summary

This report assesses the current QuFLX v2 AI implementation against Grok API's **automatic prompt caching** best practices. The analysis reveals significant opportunities to reduce token costs by **50-90%** through prompt restructuring and API header optimization.

### Key Findings

| Issue | Impact | Priority |
|-------|--------|----------|
| Dynamic context breaks prefix caching | **HIGH** - ~0% cache hit rate | 🔴 Critical |
| No `x-grok-conv-id` header | **MEDIUM** - Reduced cache grouping | 🟡 High |
| No cached token monitoring | **LOW** - Can't measure improvements | 🟡 High |
| Context size can be large (150KB limit) | **MEDIUM** - Higher costs per request | 🟢 Medium |

---

## 1. Current Implementation Analysis

### 1.1 AI Service Architecture

| Component | File | Purpose |
|-----------|------|---------|
| API Route | [`ai.py`](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai.py) | Request validation, indicator injection |
| Core Service | [`service.py`](file:///c:/QuFLX/v2/backend/services/ai/service.py) | Prompt construction, API calls |
| Voice Relay | [`ai_voice.py`](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai_voice.py) | WebSocket voice session bridge |

### 1.2 Current Prompt Structure (PROBLEMATIC)

The current prompt construction in [`service.py`](file:///c:/QuFLX/v2/backend/services/ai/service.py#L113-L167) follows this pattern:

```
┌─────────────────────────────────────────────────────────┐
│ SYSTEM MESSAGE                                          │
├─────────────────────────────────────────────────────────┤
│ 1. Base prompt (FIXED)                                  │
│ 2. OTC Data Lock notice (FIXED)                         │
│ 3. Custom Instructions (DYNAMIC - from user)            │  ← Breaks cache
│ 4. UI Mode modifier (SEMI-DYNAMIC)                      │  ← Varies per request
│ 5. Verbosity style (SEMI-DYNAMIC)                       │  ← Varies per request
│ 6. FULL Market Context JSON (DYNAMIC)                   │  ← Breaks cache
├─────────────────────────────────────────────────────────┤
│ USER MESSAGE                                            │
├─────────────────────────────────────────────────────────┤
│ 1. User prompt text                                     │
│ 2. Image (optional)                                     │
└─────────────────────────────────────────────────────────┘
```

> [!CAUTION]
> **Cache Breaking Issue**: The current design injects custom instructions and the **entire market context JSON** into the system message. This means the prefix changes on every request, resulting in **~0% cache hit rate**.

### 1.3 Missing API Optimizations

| Feature | Current State | Recommended |
|---------|---------------|-------------|
| `x-grok-conv-id` header | ❌ Not implemented | ✅ Add constant UUID per session |
| Cached token monitoring | ❌ Not logged | ✅ Log `usage.cached_tokens` |
| Prefix stability | ❌ Context in system | ✅ Restructure message order |

---

## 2. Grok API Caching Mechanics

### 2.1 How Automatic Caching Works

Per the Grok API documentation:
- **KV Cache**: The API caches key-value tensors computed during inference for **exact prefix matches**
- **Pricing**: Cached tokens cost **~75-90% less** than uncached (e.g., $0.02-$0.05/million vs $0.20+/million)
- **Scope**: Distributed across clusters; better hits with `x-grok-conv-id` grouping
- **Lifetime**: Volatile; expires after inactivity (minutes to hours)

### 2.2 Optimization Levers

1. **Prefix Stability**: Keep identical content at the start of every prompt
2. **Conversation ID Header**: Route related requests to same cache pool
3. **Append-Only History**: Don't modify previous messages in multi-turn
4. **Consistent JSON Format**: Same key order, no extra fields in injected data

---

## 3. Recommended Changes

### 3.1 Restructure Prompt Architecture (Priority: CRITICAL)

**Goal**: Maximize prefix stability by moving all static content first

```
┌─────────────────────────────────────────────────────────┐
│ SYSTEM MESSAGE (FIXED - CACHEABLE)                      │
├─────────────────────────────────────────────────────────┤
│ 1. Base QuFLX Trading Assistant identity                │
│ 2. OTC Data Lock rule                                   │
│ 3. Tool definitions (if using function calling)         │
│ 4. Output format guidelines                             │
│ 5. General trading analysis instructions                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ USER MESSAGE (DYNAMIC - per request)                    │
├─────────────────────────────────────────────────────────┤
│ 1. UI Mode instruction (modal/insights)                 │
│ 2. Verbosity instruction (concise/detailed/balanced)    │
│ 3. Custom instructions (if any)                         │
│ 4. Market Context JSON (asset, timeframe, indicators)   │
│ 5. User prompt text                                     │
│ 6. Image (optional)                                     │
└─────────────────────────────────────────────────────────┘
```

**Code Change Location**: [`service.py`](file:///c:/QuFLX/v2/backend/services/ai/service.py#L113-L167)

### 3.2 Add `x-grok-conv-id` Header (Priority: HIGH)

**Implementation**: Generate a stable conversation ID per user session

```python
# In service.py - add to headers
headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {self.api_key}',
    'x-grok-conv-id': conversation_id,  # NEW: Session/asset-based UUID
}
```

**ID Strategy Options**:
1. **Per-session**: Same ID for all requests in a user session
2. **Per-asset**: Same ID for all requests on the same asset
3. **Per-workflow**: Same ID for related requests (e.g., all "Analysis" calls)

### 3.3 Implement Cache Monitoring (Priority: HIGH)

**Goal**: Track cache effectiveness to validate optimizations

```python
# In service.py - after successful response
usage = data.get('usage', {})
cached_tokens = usage.get('cached_tokens', 0) or usage.get('cache_read_input_tokens', 0)
total_prompt_tokens = usage.get('prompt_tokens', 0)

cache_hit_rate = (cached_tokens / total_prompt_tokens * 100) if total_prompt_tokens > 0 else 0

logger.info(
    'AI cache stats request_id=%s cached=%d total=%d hit_rate=%.1f%%',
    request_id,
    cached_tokens,
    total_prompt_tokens,
    cache_hit_rate,
)
```

### 3.4 Optimize Context Injection (Priority: MEDIUM)

**Current**: Full context JSON dump (can be 100KB+)
**Recommended**: Structured, minimal context with consistent key ordering

```python
# Consistent, minimal context structure
context_payload = {
    "asset": asset,
    "timeframe": timeframe,
    "candles_count": len(candles),
    "latest_close": candles[-1]["close"] if candles else None,
    "indicators": {
        # Only include last few values, not full series
        "ema_20": indicators.get("ema_20", [])[-5:],
        "rsi_14": indicators.get("rsi_14", [])[-5:],
    }
}
# Always use separators=(',', ':') and consistent key order
context_str = json.dumps(context_payload, separators=(',', ':'), sort_keys=True)
```

---

## 4. Market Condition Indicator Considerations

> [!NOTE]  
> Different market conditions require different indicators. The context injection should be adaptive but consistent within market regimes.

| Market Regime | Primary Indicators | Confluence Indicators |
|---------------|-------------------|----------------------|
| Trending (pullbacks) | EMA Cross, MACD | RSI, Supertrend |
| Strong Momentum | MACD, ROC | Schaff TC, DeMarker |
| Ranging | Bollinger Bands, RSI | Williams %R, CCI |
| Breakout | ATR, Bollinger Squeeze | Volume, ADX |
| Reversal | Stochastic, DeMarker | CCI, RSI Divergence |

**Recommendation**: Group indicators by regime and only inject relevant ones to reduce context size.

---

## 5. Implementation Roadmap

### Phase 1: Quick Wins (1-2 hours)

- [ ] Add `x-grok-conv-id` header with session-based UUID
- [ ] Add cache monitoring logging
- [ ] Measure baseline cache hit rate

### Phase 2: Prompt Restructure (2-4 hours)

- [ ] Move dynamic content from system to user message
- [ ] Create stable system prompt template
- [ ] Test cache hit rates improvement

### Phase 3: Context Optimization (2-3 hours)

- [ ] Implement consistent JSON serialization
- [ ] Limit indicator history depth (last 5-10 values vs 50)
- [ ] Add regime-based indicator selection

### Phase 4: Voice Relay Optimization (Optional)

- [ ] Review voice session message structure
- [ ] Apply similar prefix stability principles

---

## 6. Expected Benefits

| Metric | Current (Est.) | After Optimization |
|--------|----------------|-------------------|
| Cache Hit Rate | ~0-5% | 50-90% |
| Cost per Request | Full rate | 10-50% of current |
| Latency | Standard | 2-5× faster (cached) |
| Weekly Cost | $22 (example) | $2-10 |

---

## 7. Verification Plan

### 7.1 Before Implementation
```bash
# Run existing tests to establish baseline
python -m pytest backend/tests/test_ai_service.py -v
```

### 7.2 Cache Monitoring
After adding logging, monitor for:
- `cache_hit_rate` in logs
- `cached_tokens` count per request

### 7.3 Cost Tracking
Review xAI API usage dashboard for:
- Cached vs uncached token breakdown
- Cost reduction over time

---

## Appendix: Files to Modify

| File | Changes |
|------|---------|
| [`service.py`](file:///c:/QuFLX/v2/backend/services/ai/service.py) | Restructure prompts, add header, add logging |
| [`ai.py`](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai.py) | Pass conversation ID to service |
| [`ai_voice.py`](file:///c:/QuFLX/v2/backend/services/gateway/routes/ai_voice.py) | Consider adding similar optimizations |

---

*Report compiled by Team Leader persona based on Grok API recommendations and QuFLX v2 codebase analysis.*
