**Task: Enhance OTC Alert Dispatch Script for Efficiency & Effectiveness**

**Agent Role**: Lead Coding Agent for QuFLX v2 (OTC trading platform). Prioritize reliability, efficiency, and trading edge.  
**Rule**: Do **NOT** modify any code files until explicitly approved with "promote to proceed".

**Problem**  
Current `otc_alert_dispatch.py` is functional but limited:  
- Scanner logic too basic (e.g., only ADX>25 + BB breakout/squeeze; arbitrary thresholds like BB width<0.05).  
- AI prompt vague & under-contextualized (only 3 indicators; no history summary, levels, or images).  
- Insufficient candles (50; borderline for indicators like ADX).  
- Naive AI response parsing (string checks; error-prone).  
- No normalization for asset-specific thresholds → false positives/negatives.  
- Lacks backtesting, confidence filtering, and performance optimization for 50+ assets.  
- No user-configurable AI confirmation toggle.  
Impact: Low win-rate alerts, missed opportunities, potential slowdowns during bursts.

**Goal**  
Refactor for production-grade "sniper" system:  
- Enrich scanner with advanced logic & normalization.  
- Improve AI integration (richer context, structured output/parsing).  
- Add backtesting harness & confidence filtering.  
- Optimize for scale (batching, more candles).  
- Add frontend toggle to enable/disable AI confirmation (in new 'Alerts and Notifications' settings section).  
Result: Higher accuracy, fewer false alerts, better performance, user control.

**Phase 1 – Mandatory Inspection & Assessment**  
Before any code changes:  
1. Thoroughly review:  
   - `otc_alert_dispatch.py` (full script: scanner, AIOrchestrator, DiscordDispatcher, etc.).  
   - Related files: `backend/utils/history_utils.py` (data fetching), TA lib usage, frontend settings (e.g., any existing panels).  
   - Integrations: AI endpoint, Redis mode, test mode.  

2. Assess:  
   - Current logic effectiveness (scanner rules, AI prompt/parsing, candle count).  
   - Performance bottlenecks (e.g., pandas/TA-lib on many assets).  
   - Feasibility of additions (e.g., EMA cross, support/resistance calc; backtesting integration).  
   - Frontend impact: How to add toggle (e.g., via API/env var; new settings section).  
   - Risks (e.g., added complexity, data privacy for images).  
   - Dependencies (TA-lib, pandas versions; frontend framework).  

3. Deliver a markdown report summarizing:  
   - Current strengths/weaknesses with examples.  
   - Pros/cons of proposed enhancements.  
   - Estimated impact (e.g., "Improve win-rate by 30-50% via richer logic").  
   - Edge cases/prerequisites (e.g., volume data availability).  

Submit the assessment for review. **Wait for approval before proceeding.**

**Phase 2 – Implementation Plan (only after "promote to proceed")**  
1. Enhance Scanner (`MarketScanner`):  
   - Increase candles to 100-200 (configurable).  
   - Add rules: EMA cross (e.g., 9/21), support/resistance (e.g., recent highs/lows), time filters (e.g., avoid low-liquidity hours), volume if available.  
   - Normalize thresholds (e.g., BB width relative to ATR or asset vol).  
   - Add confidence score (0-100) based on confluence.  

2. Improve AI Integration (`AIOrchestrator`):  
   - Enrich prompt: Include candle summary (e.g., recent trends), key levels, price action desc; optional image URL if chart available.  
   - Require structured JSON output (e.g., {'confirmed': bool, 'reason': str, 'confidence': float}).  
   - Robust parsing: Use `json.loads` with error handling/fallback.  

3. Add Backtesting Harness:  
   - New method/class: Load historical CSVs, simulate scanner/AI over periods, compute win-rate/P&L.  
   - CLI flag (e.g., `--backtest asset=EURRUBOTC start=YYYY-MM-DD`).  

4. Add Confidence Filtering:  
   - Filter alerts below threshold (e.g., AI confidence >0.7 or scanner score >70).  
   - Make configurable.  

5. Performance Optimizations:  
   - Batch TA calcs across assets if possible.  
   - Limit concurrent AI calls (e.g., semaphore for 5 at once).  

6. New Feature: AI Confirmation Toggle  
   - Backend: Add env var/flag (e.g., `ENABLE_AI_CONFIRM=True`); if False, skip AI and send alerts directly.  
   - Frontend: In settings panel, add 'Alerts and Notifications' section with toggle switch; save to backend API/env.  

7. Testing:  
   - Unit tests: Mock data for scanner/AI/backtest.  
   - Integration: Simulate multi-asset runs; test toggle.  
   - Benchmark: Compare speed/accuracy before/after. 

**Compile a Report**
report_alert_dispatch_enhancements_26-02-08.md and save in @reports\reports_2026-02 folder 


**Next action**: Start Phase 1 (inspection & assessment) and submit the report.