# Statement Analysis Page — Dev Plan
**Date:** 2026-02-20  
**Route:** `/statement-analysis`  
**Component:** `gui/Dashboard/src/components/StatementAnalysisPage.jsx`  
**Status Legend:** `[x]` Done · `[~]` In Progress · `[ ]` Pending

---

## Phase 0 — Foundation (Nav & Routing)

- [x] Add `Statements & Logs` section to `ProfileMenu.jsx` with links to all non-workspace pages
- [x] Add `useNavigate` hook + Lucide icons to `ProfileMenu.jsx`
- [x] Register `/statement-analysis` route in `App.jsx`
- [x] Create placeholder `StatementAnalysisPage.jsx` (Coming Soon layout — build passes)
- [x] Verify clean Vite build

---

## Phase 1 — CSV Parser & Data Model

- [ ] Port `parsePocketOptionCSV()` from `gui/RiskManager/src/lib/csv-parser.ts` into the component
  - Fields: `direction, order, expiration, asset, openTime, closeTime, openPrice, closePrice, tradeAmount, profit, currency`
  - Handle quoted CSV values correctly (existing logic)
  - Validate column headers on parse — reject non-PO files gracefully
- [ ] Add drag-and-drop upload zone (no backend required — `FileReader` API)
- [ ] Support multi-file upload (array of parsed statement periods)
- [ ] Show parse summary after upload: total trades found, date range, currency

---

## Phase 2 — Core Analytics Engine (Pure JS)

All calculations run in-browser on the parsed trade array.

### 2a — Summary KPIs
- [ ] Total trades (with W / L / T breakdown badge)
- [ ] Win rate overall
- [ ] Win rate split: CALL win rate vs PUT win rate
- [ ] Total P&L (colour-coded green/red)
- [ ] ROI % = `(totalProfit / totalInvestment) × 100`
- [ ] Average trade stake
- [ ] Best single day profit / Worst single day loss
- [ ] Profit Factor = `gross wins / gross losses`
- [ ] Max Drawdown = largest peak-to-trough cumulative loss run

### 2b — Asset Performance Panel
- [ ] Group trades by asset, compute per-asset: count, wins, losses, profit, win rate
- [ ] Sort toggle: **By Profit** / **By Win Rate** / **By Trade Count**
- [ ] Visual win-rate progress bar within each asset row
- [ ] Trophy badge on highest-profit asset
- [ ] Danger badge on worst-profit asset

### 2c — Expiry Duration Analysis  *(New vs source feature)*
- [ ] Group trades by expiration bucket: `30s / 1m / 2m / 3m / 5m / Other`
- [ ] Per-bucket: trade count, win rate, total P&L
- [ ] Surface plain-language verdict: *"Your 1m trades are your strongest (64% WR)"*
- [ ] Warning chip: *"Avoid 30s — worst performing expiry"*

### 2d — Time-of-Day Heatmap  *(New vs source feature)*
- [ ] 24-column heatmap (one cell per UTC hour)
- [ ] Cell colour = win rate gradient (red → yellow → green)
- [ ] Tooltip on hover: trades count + win rate for that hour
- [ ] "Best trading hours" summary chip (top 3 hours by win rate)
- [ ] "Avoid these hours" chip (bottom 3 hours by win rate, min 3 trades)

### 2e — Direction Analysis
- [ ] CALL vs PUT: count, P&L, win rate, profit factor
- [ ] Visual ratio bar (CALL share vs PUT share of total trades)

### 2f — Streak & Consistency Metrics  *(New vs source feature)*
- [ ] Max consecutive wins
- [ ] Max consecutive losses
- [ ] Current streak (from most recent trade)
- [ ] Average number of trades before a losing streak ends

### 2g — Daily Performance Breakdown
- [ ] Scrollable daily list: date, trade count, wins, losses, daily P&L
- [ ] Mini sparkline bars alongside each day (relative P&L width)
- [ ] "Best day" / "Worst day" badge

### 2h — Risk Management Scorecard  *(New vs source feature)*
- [ ] Kelly Criterion estimate: `(WR - (1 - WR) / avgPayout) × 100`
- [ ] Suggested max stake % of implied account balance
- [ ] Consecutive loss tolerance estimate

---

## Phase 3 — AI Coach Panel

Uses existing `POST /api/ai/ask` endpoint — no new backend endpoint needed.
Computed stats dict (not raw CSV) sent as `context` field (within 150 KB limit).

- [ ] Build `buildAIContext(trades, stats)` helper — serialises key metrics into a concise AI-readable summary object
- [ ] Preset analysis buttons:
  - [ ] **"Analyse my strongest patterns"**
  - [ ] **"Where am I losing the most?"**
  - [ ] **"Suggest an optimal trading schedule"**
  - [ ] **"Risk management review"**
- [ ] Free-form custom question input
- [ ] Render AI response with markdown (reuse `ReactMarkdown` + `remarkGfm` already in project)
- [ ] Loading spinner during AI call
- [ ] Error state with retry option
- [ ] Clear conversation / reset button

---

## Phase 4 — Multi-Period Comparison  *(Stretch)*

- [ ] Upload 2+ CSV files (labelled by date range automatically)
- [ ] Side-by-side KPI delta view: win rate change, ROI change, profit change
- [ ] "Most improved asset" and "Most declined asset" between periods

---

## Phase 5 — Polish & UX

- [ ] Match QuFLX v2 design system: `bg-card-bg`, `border-border-primary`, `text-accent-blue`, theme tokens
- [ ] Responsive layout (single-column on narrow viewports)
- [ ] Empty / error states for each panel (no trades, bad file, parse error)
- [ ] "Reset / Upload New File" button visible at all times
- [ ] Keyboard accessible (upload trigger via Enter/Space)

---

## Phase 6 — Verification

- [ ] Build passes: `npx vite build --mode development` (no errors, no warnings)
- [ ] Upload a real Pocket Option CSV statement and verify all KPIs match manual calculation
- [ ] Test with edge cases: empty file, single trade, all wins, all losses
- [ ] Verify AI panel sends correct context payload and renders response
- [ ] Verify Drag-and-drop upload works
- [ ] Verify multi-file upload and comparison view

---

## Files Touched

| File | Action |
|------|--------|
| `gui/Dashboard/src/components/StatementAnalysisPage.jsx` | [x] Created (placeholder) → [ ] Full implementation |
| `gui/Dashboard/src/components/ProfileMenu.jsx` | [x] Added Statements & Logs nav section |
| `gui/Dashboard/src/App.jsx` | [x] Route registered |

---

## Source Reference

Ported from: `gui/RiskManager/src/pages/DataVisualizationDemo.tsx`  
CSV parser reference: `gui/RiskManager/src/lib/csv-parser.ts`  
AI endpoint: `backend/services/gateway/routes/ai.py` → `POST /api/ai/ask`
