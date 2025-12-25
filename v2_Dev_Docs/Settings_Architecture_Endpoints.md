# QuFLX v2 – Platform Settings & Configuration Overview  
**Date:** December 25, 2025  
**Purpose:** Provide a prioritized, scalable settings structure for the entire platform, covering Global, User, AI, and each Sidebar tab section.  
Focus is on **foundational, structurally sound** configuration that supports future growth without unnecessary complexity.

## Design Principles
- All settings stored in a single source of truth (initially localStorage → later optional backend profile sync).  
- Use a dedicated Zustand slice (`useSettingsStore`) with persistence.  
- Separate **Essential** (must-have for core functionality/safety) from **Nice-to-Have** (enhancements).  
- Prioritize **High** → **Medium** → **Low** within each section for implementation order.

---

### 1. Global Settings  
*(Affects the entire application – accessible via Settings tab)*

**ESSENTIAL (High Priority)**  
- Theme mode (Light / Dark / System)  
- Language / Locale (EN default, future expansions)  
- Auto-start services on launch (Collector, Gateway, Chrome session)  
- Debug logging level (Off / Errors only / Verbose) – for production safety  
- Data persistence location (localStorage only vs optional cloud sync toggle)  

**NICE-TO-HAVE (Medium Priority)**  
- Global font size / UI scaling  
- Notification sounds (success, error, alert)  
- Default dashboard layout on startup (last used tab or fixed)  
- Timezone override (for session planning)  

**NICE-TO-HAVE (Low Priority)**  
- Custom color themes beyond light/dark  
- Animation intensity toggle  

---

### 2. User Profile Settings  
*(Personal identification & preferences – visible in ProfileMenu)*

**ESSENTIAL (High Priority)**  
- Username / Display name  
- Default stake size (for risk calculations)  
- Preferred payout threshold (default 92%, adjustable for filtering)  

**NICE-TO-HAVE (Medium Priority)**  
- Avatar upload / placeholder selection  
- Trading experience level (Beginner / Intermediate / Advanced) – influences AI tone defaults  
- Preferred trading sessions (multi-select: London OTC, NY overlap, etc.)  

**NICE-TO-HAVE (Low Priority)**  
- Bio / notes field  
- Preferred units (USD, EUR, etc. for P&L display)  

---

### 3. AI Assistant Settings  
*(Dedicated sub-panel in Settings or AI Insights tab)*

**ESSENTIAL (High Priority)**  
- Default model selection (Fast vs Advanced/Vision)  
- Auto-include context toggles:  
  - Market data & indicators  
  - Current risk status  
  - Chart screenshot  
- Response verbosity (Concise / Balanced / Detailed)  
- Safety level (Advisory only vs Suggest actions with confirmation)  

**NICE-TO-HAVE (Medium Priority)**  
- Tone/persona (Professional / Coaching / Direct)  
- Always provide structured summary (regime, risks, confidence)  
- Custom system prompt override (advanced users)  
- Quick prompt favorites (editable list)  

**NICE-TO-HAVE (Low Priority)**  
- Temperature / creativity slider  
- Max tokens limit  
- Voice persona & speed (once voice is implemented)  

---

### 4. Dashboard Tab Settings  

**ESSENTIAL (High Priority)**  
- Max assets limit for Get Assets  
- Specific assets filter list  
- OTC-only mode toggle  
- Auto-refresh interval (Off / 5 min / 10 min / custom)  

**NICE-TO-HAVE (Medium Priority)**  
- Default ticker mode (List vs Tape)  
- Payout display threshold (show only ≥ X%)  
- Favorite asset sorting (Payout / Alphabet / Manual)  

**NICE-TO-HAVE (Low Priority)**  
- Custom panel column layout  

---

### 5. Analysis Tab Settings  

**ESSENTIAL (High Priority)**  
- Default visible indicators (multi-select overlays & oscillators)  
- Oscillator pane visibility & default order  

**NICE-TO-HAVE (Medium Priority)**  
- Indicator parameter defaults (e.g., EMA 16 vs 20)  
- Performance metrics display preferences (Win rate first vs Expectancy first)  
- Time-of-day heatmap granularity  

**NICE-TO-HAVE (Low Priority)**  
- Custom analysis dashboard layouts (saved views)  

---

### 6. Live Trading Tab Settings  
*(Future manual input panel)*

**ESSENTIAL (High Priority)**  
- Default expiry duration  
- Quick direction buttons visibility  

**NICE-TO-HAVE (Medium Priority)**  
- Stake size quick presets  
- One-click trade confirmation toggle  

**NICE-TO-HAVE (Low Priority)**  
- Custom hotkey mappings  

---

### 7. Risk Manager Tab Settings  

**ESSENTIAL (High Priority)**  
- Daily max trades  
- Max consecutive losses  
- Daily profit target  
- Max drawdown %  
- Session reset time (midnight local vs custom)  

**NICE-TO-HAVE (Medium Priority)**  
- Recovery mode (Masaniello steps configuration)  
- Stake sizing method (Fixed / % of balance)  
- Warning threshold % (e.g., alert at 80% of limit)  

**NICE-TO-HAVE (Low Priority)**  
- Custom risk profile presets (Aggressive / Conservative / Custom)  

---

### 8. Calendar & Journal Tab Settings  

**ESSENTIAL (High Priority)**  
- Session time blocks definition (start/end times)  
- Auto-logging of trade outcomes toggle  

**NICE-TO-HAVE (Medium Priority)**  
- Default tags for journal entries  
- Session planning templates  
- Journal export format preference (CSV / PDF)  

**NICE-TO-HAVE (Low Priority)**  
- Calendar color scheme per session type  

---

### 9. Strategy Lab Tab Settings  

**ESSENTIAL (High Priority)**  
- Backtest history window (last N candles)  
- Default slippage & commission assumptions  

**NICE-TO-HAVE (Medium Priority)**  
- Saved strategy list  
- Walk-forward testing parameters  

**NICE-TO-HAVE (Low Priority)**  
- Monte Carlo simulation iterations  

---

### 10. General Production Considerations

**Essential for Production Readiness**  
- All settings persisted securely and loaded on startup  
- Graceful defaults if settings corrupted/missing  
- Validation on critical numeric inputs (prevent negative max trades, etc.)  
- Clear reset-to-defaults option per section and global  

**Scalability Foundations**  
- Modular storage: separate slices per major section to avoid monolithic settings object  
- Versioned settings schema (for future migrations)  
- Audit log for critical changes (e.g., risk limits adjusted) – optional but recommended  
- Rate limiting / cost monitoring for AI queries (display usage warnings)  

This structure provides a clean, prioritized foundation: implement **Essential High Priority** items first across all sections to achieve a stable, safe production-ready state, then layer in Medium and Low priority features iteratively. The modular approach ensures new tabs or features can add their own settings without destabilizing existing ones.