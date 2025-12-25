# GUI Sidebar Layout Report – QuFLX v2 (2025-12-24)

## 1. Purpose

This report defines the **foundational scaffolding** for the new Sidebar tab layout and associated UI elements shown in the wireframe, without yet changing core trading logic or indicator implementation.

Goals:
- Keep the **chart visible at all times** while switching contextual side panels via tabs.
- Align Sidebar tabs with the evolving feature set (Dashboard, Analysis, AI Insights, Input, Risk Manager, Calendar & Journal, Strategy Lab; Settings later).
- Plan modular components and file structure changes so implementation is safe, incremental, and aligned with `CORE_PRINCIPLES.md`.
- Prepare for future integration of Ask AI, screenshot capture, "Add Object" controls, and profile menu in a clean layout.

This document is intended for @UI-Designer, @Frontend-Specialist, and @Coder as the architectural reference for the upcoming UI changes.

---

## 2. Current Dashboard Layout (Reference)

Key files (current state):
- `gui/Dashboard/src/components/Dashboard.jsx:17–42`
  - Top-level layout:
    - `Sidebar` on the left.
    - `TopBar` across the top of the main area.
    - Main workspace: **two-panel layout** in a 12-column grid:
      - Left: `AssetPanel` (data source + 92% payout assets, resizable inside itself).
      - Right: `ChartWorkspace` (chart + header + live feed badge).
- `gui/Dashboard/src/components/Sidebar.jsx:5–60`
  - Simple collapsible sidebar that tracks `activeTab` in `marketStore`.
  - Tabs currently: `Dashboard`, `Analysis`, `Automations`, `Settings`.
  - Visual treatment already close to the wireframe (vertical buttons).
- `gui/Dashboard/src/components/TopBar.jsx:10–171`
  - Shows:
    - Status badges (WS, Chrome, Stream) via `StatusIndicator` and `useStreamHealth`.
    - Theme toggles.
    - **Camera button** (screenshot) and **Ask AI button** (text+vision), currently on the right side of the top bar.
- `gui/Dashboard/src/components/ChartWorkspace.jsx:9–127`
  - Composed of a `Card` with:
    - `ChartHeader` for chart controls (asset combo, timeframe combo, CSV options, indicator dropdown).
    - Chart display area with `ChartContainer`, live feed badge, and loading overlay.

The current implementation already satisfies the "chart visible at all times" requirement. The main change is **how panels and controls are organized around the chart** and **how Sidebar tabs map to contextual views**.

---

## 3. Target Sidebar Tab Model

### 3.1 Tab Set

Based on the wireframe and your requirements, the target Sidebar tabs are:

1. `Dashboard` – Main operational view (current data source + 92% panel layout).
2. `Analysis` – Indicator-centric and performance analysis tools.
3. `AI Insights` – AI-driven analysis, Ask-AI history, and structured suggestions.
4. `Live Trading` – Manual trade input controls and strategy parameter inputs.
5. `Risk Manager` – Risk profiles, max exposure, and related dashboards.
6. `Calendar & Journal` – Session notes, trade journal, and event calendar.
7. `Strategy Lab` – Experimental strategies, backtests, and lab tools.
8. `Settings` – Global settings (ignored for implementation now, but space reserved in UI).

### 3.2 Tab Representation in State

Current store (`marketStore.js`) already tracks `activeTab` as a string with values like `dashboard`, `analysis`, `automations`, `settings`.

Recommended adjustments:
- Normalize to a **string union** (even in JS, treat as a small enum conceptually):
  - `"dashboard" | "analysis" | "ai_insights" | "live_trading" | "risk_manager" | "calendar_journal" | "strategy_lab" | "settings"`.
- Keep `activeTab` in the store as the **single source of truth** for which contextual side panel is displayed.
- Sidebar component becomes purely a **selector for `activeTab`**, not a layout controller.

### 3.3 Sidebar Component Structure

Planned component layout:
- `Sidebar.jsx` remains as the container.
- Introduce a small config map (could be in the same file or a separate module):

  ```js
  const SIDEBAR_TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'ai_insights', label: 'AI Insights' },
    { id: 'live_trading', label: 'Live Trading' },
    { id: 'risk_manager', label: 'Risk Manager' },
    { id: 'calendar_journal', label: 'Calender & Journal' },
    { id: 'strategy_lab', label: 'Strategy Lab' },
    { id: 'settings', label: 'Settings' },
  ];
  ```

- `Sidebar` maps over this configuration to render `SidebarItem` components; spacing and style follow the current implementation.
- Icons can be kept simple or refined later by @UI-Designer; current lucide icons are acceptable placeholders for the foundational phase.

This gives a stable, extensible structure: adding or renaming a tab is a change to **one configuration array**, not scattered logic.

---

## 4. Main Content Layout Per Tab

### 4.1 Invariant: Chart Always Visible

For all Sidebar tabs (except future Settings view, if it needs a full-screen layout):

- The **chart area remains in the right-hand pane** as it is today.
- Only the **left-hand contextual panel** on the Dashboard changes based on `activeTab`.
- This ensures traders always see the live chart while switching between Dashboard, Analysis, AI Insights, etc.

### 4.2 Context Panel Layout

We reuse the current **two-panel mental model**:
- Right: `ChartWorkspace` (unchanged location).
- Left: a contextual panel component that depends on `activeTab`.

Proposal:
- Create a new component: `ContextPanelRouter` (name illustrative) used inside `Dashboard.jsx` in place of the raw `AssetPanel`.

  - File: `gui/Dashboard/src/components/ContextPanelRouter.jsx` (planned).
  - Responsibility: given `activeTab`, choose which component to render in the left-side grid column.
  - Example sketch:

    ```jsx
    const ContextPanelRouter = ({ activeTab }) => {
      switch (activeTab) {
        case 'dashboard':
          return <AssetPanel />; // current behavior
        case 'analysis':
          return <AnalysisPanel />; // placeholder component
        case 'ai_insights':
          return <AiInsightsPanel />; // placeholder
        case 'live_trading':
          return <LiveTradingPanel />;
        case 'risk_manager':
          return <RiskManagerPanel />;
        case 'calendar_journal':
          return <CalendarJournalPanel />;
        case 'strategy_lab':
          return <StrategyLabPanel />;
        default:
          return <AssetPanel />;
      }
    };
    ```

- For the foundational phase, each new `*Panel` component can:
  - Reuse the **Card + resizable layout** concept established in `AssetPanel.jsx`.
  - Provide simple placeholder content (e.g., titles and empty sections) while keeping the structure ready for real features.

This approach maintains **strict separation of concerns**:
- `Dashboard.jsx` controls only grid/layout.
- `ContextPanelRouter` decides which panel to show.
- Each panel handles its own internal sub-layout and state.

---

## 5. Ask AI, Screenshot, Profile Pic, and Add Object

### 5.1 Ask AI and Screenshot Buttons

Current state (already top-bar level):
- In `TopBar.jsx:103–152`, the **Camera** and **Ask AI** buttons live in the top bar, to the right of the status badges and theme toggles.
- For consistency with the wireframe (buttons aligned with the top edge of the chart rather than global app bar), a better long-term layout is:

**Recommendation:**
- Move Ask AI and Screenshot controls from `TopBar` into a dedicated **chart actions** area within `ChartHeader`.
- Implementation approach:
  - Introduce a new component `ChartActions` that encapsulates:
    - Screenshot capture button.
    - Ask AI button (which will call the `/api/v1/ai/ask` endpoint already added).
  - `ChartHeader` will receive handlers/props needed for these actions and render `ChartActions` on the **right side** of the header row.
  - `TopBar` remains focused on **global status + theme + profile menu**.

This matches the wireframe: chart-specific actions live in the chart header, not the global top bar.

### 5.2 Profile Picture Placeholder

The wireframe shows a profile picture placeholder at the top right.

**Recommendation:**
- Add a new `ProfileMenu` component rendered at the far right of `TopBar`.
- For now, `ProfileMenu` can be a circular placeholder with initials or an icon, plus optional static text "Profile".
- No authentication wiring is needed in this phase; it is purely visual scaffolding.

File plan:
- `gui/Dashboard/src/components/ProfileMenu.jsx` – handles avatar placeholder and a future dropdown shell.
- Used inside `TopBar.jsx` alongside status indicators and theme toggles.

### 5.3 "Add Object" Combo Box Placeholder

The wireframe calls for an **"Add Object"** combo next to the indicator dropdown, for drawing trade-related objects (lines, zones, etc.).

Current state:
- `ChartWorkspace.jsx:56–60` defines `indicatorOptions` and passes them to `ChartHeader`.
- `ChartHeader` (not shown here) already renders comboboxes for asset, timeframe, CSV, and indicators.

**Recommendation:**
- Extend `ChartHeader` props with:
  - `addObjectOptions` – placeholder options for chart objects (e.g. Horizontal Line, Zone, Label).
  - `onAddObjectSelect` – handler stub.
- Add a simple combobox component (similar to indicator combo) to the right of the indicator dropdown.

File plan:
- If not already modular, create a small combobox component under `components/common/` (or reuse existing Combobox). For now, keep it visually aligned without implementing actual drawing logic.

This sets up future work where selecting an object will signal `ChartContainer` or a drawing manager to add overlays, without blocking current progress.

---

## 6. Modular File & Folder Structure (Planned)

To keep the UI scalable and maintainable, the following structure is recommended for new components:

- `gui/Dashboard/src/components/layout/`
  - `ContextPanelRouter.jsx` – maps `activeTab` → contextual panel.
  - `ProfileMenu.jsx` – profile/avatar placeholder.
- `gui/Dashboard/src/components/panels/`\
  - `DashboardPanel.jsx` – alias/wrapper for `AssetPanel` (optional, or re-use directly).
  - `AnalysisPanel.jsx` – placeholder Card with future analysis content.
  - `AiInsightsPanel.jsx` – placeholder Card for AI chat/insights.
  - `LiveTradingPanel.jsx` – placeholder Card for manual live-trading input.
  - `RiskManagerPanel.jsx` – placeholder Card for risk controls.
  - `CalendarJournalPanel.jsx` – placeholder Card for calendar/journal.
  - `StrategyLabPanel.jsx` – placeholder Card for lab features.
- `gui/Dashboard/src/components/chart/`
  - `ChartHeader.jsx` – already present; extended to include `ChartActions` and the Add Object combobox.
  - `ChartActions.jsx` – new; contains Ask AI + screenshot buttons wired to existing handlers.

This modularization keeps:
- Sidebar concerns in `Sidebar.jsx`.
- Tab-to-panel routing in `ContextPanelRouter`.
- Chart-level actions in `ChartActions`.
- TopBar reserved for global status, theme, and profile.

---

## 7. Implementation Order & Risk

To minimize risk and follow the project’s incremental philosophy, recommended order:

1. **Sidebar Tab Config Only**
   - Update `Sidebar.jsx` to use the new tab list (including AI Insights, Risk Manager, etc.) without changing content routing yet.
   - Keep `activeTab` handling as-is.

2. **Introduce `ContextPanelRouter`**
   - Replace direct `AssetPanel` usage in `Dashboard.jsx` with `ContextPanelRouter` that initially always returns `AssetPanel`.
   - Then, progressively introduce placeholder panels for additional tabs.

3. **ProfileMenu in TopBar**
   - Add a non-functional profile avatar placeholder to the right side of `TopBar`.

4. **ChartActions + Add Object Placeholder**
   - Extract screenshot + AskAI logic into `ChartActions` used within `ChartHeader`.
   - Add the Add Object combobox next to the indicator dropdown, wired to a no-op handler.

5. **Visual Refinements**
   - Allow @UI-Designer to adjust spacing, typography, and exact Tailwind classes to better match the wireframe.

Throughout, the chart remains visible and stable, and no core data/indicator logic is touched.

---

## 8. Summary

- The chart will stay visible at all times; only the contextual left-hand panels will change based on Sidebar tabs.
- Sidebar tabs will be expanded to the desired set, using a configuration-driven approach.
- A `ContextPanelRouter` will coordinate which panel to render per tab, starting with simple placeholders.
- Ask AI and screenshot actions will move into a dedicated `ChartActions` area in `ChartHeader`, matching the wireframe’s chart-level controls.
- A profile picture placeholder will be added to `TopBar`, and an Add Object combobox placeholder will be placed next to the indicator dropdown.
- The recommended file structure keeps concerns clearly separated and prepares the UI for future expansion (AI Insights, voice, risk manager, strategy lab) without destabilizing the existing trading pipeline.
