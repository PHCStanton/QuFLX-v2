# Development Alignment Document

**Purpose:** Ensure shared understanding between coding agent and user regarding component development priorities and required clarifications.

---

## FRONTEND CONSIDERATIONS

### 1. Collapsible Sidebar Menu

**Dashboard:**
- Define critical functionalities
- Determine scope and priorities

**Analysis:**
- **Strategy Development:** Dashboard-based or separate tab?
- **Market Conditions:** Identify optimal trading windows (days, times)
- **Data Collection:** Source location (Dashboard or dedicated tab)?
- **Asset Profitability:** Daily/weekly tracking implementation

*Request: Identify additional high-value features*

**Analysis Tab:**
- Define tab contents and structure

**Automations Tab:**
- List current automations
- Discuss additions:
  - Pending order automation
  - Real/mock trade execution
  - Top-down analysis with AI-ready screenshots

**Settings:**
- Define available application settings

### 2. Connection Management

**Chrome Session:**
- Uses `start_hybrid_session.py`
- **Question:** Can Dashboard trigger connection directly?

**Streaming Server:**
- Previously handled by `streaming_server.py`
- **Questions:** 
  - Has implementation changed?
  - Can Dashboard manage connection without issues?

### 3. Data Source Section

**Current Status:** In progress, no immediate questions

**Objectives:**
- Real-time data streaming display
- Supabase database integration
- Separation of tick vs. candle data (per `@DataAnalysis_Page_Layout_Wireframe.txt`)

**V1 Reference:**
- `favorite_star_select.py` handled asset selection via Selenium

**UI Note:** 92% Assets list requires scrollable panel

### 4. Automations
*(See Section 1: Collapsible Sidebar Menu)*

### 5. TradingView Lightweight Charts

**Resource:** https://tradingview.github.io/lightweight-charts/tutorials  
**Local Path:** `C:\QuFLX\gui\lightweight-charts\website\tutorials`

Use Context7 MCP for development context and feature exploration.

### 6. Stats Cards
*Awaiting specification*

### 7. AI Integration
Implementation via company API for "Ask AI" feature.

### 8.Can you change the color of the backgroung of the Combobox inner card sections of the stats card to #0f1419 background? 

---

**Next Steps:** Address questions and define unspecified components before proceeding with development.