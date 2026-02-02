# Implementation Plan: AI Insights Panel & Integrations Check

This plan documents the step-by-step implementation of the AI Insights Panel modifications and global settings updates approved by the user.

## 1. Store Updates (Settings)
- [ ] Update `useSettingsStore` to include `fontSize` in `global` settings.
- [ ] Define normalization logic for `fontSize`.

## 2. Global Style Injection
- [ ] Update `Dashboard.jsx` to read `settings.global.fontSize` and inject it as a CSS variable (e.g. `--app-font-size`) or apply a utility class to the root.

## 3. Settings Panel UX
- [ ] Update `SettingsPanel.jsx`:
    - Add `FontSize` slider/dropdown usage.
    - Set `defaultOpen={false}` for all `SettingsSection` components.

## 4. Ask AI Presets Update
- [ ] Implement new presets in `AskAiModal.jsx` using the content from `TopDown_Analysis_Prompts.md`:
    - 1. Quick MTF Predict
    - 2. Standard Top-Down Entry
    - 3. Full Confluence Report
    - 4. 15s/30s Blitz

## 5. AI Insights Panel Upgrades
- [ ] **State & Logic**: Add state for Analysis Toggles (`filters`) in `AiInsightsPanel.jsx`.
- [ ] **UI Components**: Render "Filter Chips" / Toggles below Payout Panel.
    - [ ] Immediate Entries
    - [ ] Key Levels
    - [ ] Top-Down Analysis
- [ ] **Prompt Engineering**: Modify `handleSend` to construct prompts based on active toggles.
- [ ] **Presets Integration**: Allow selecting one of the new "Modes" (Quick/Deep) directly in the panel (optional UI optimization, or just rely on Toggles).
- [ ] **Auto-Scroll**: Add `useRef` and `useEffect` to scroll chat to bottom on new message.

## 6. Verification
- [ ] Verify Toggles update the prompt text correctly.
- [ ] Verify Auto-scroll works.
- [ ] Verify Font Size changes affect the UI.
- [ ] Verify Settings Sections are collapsed by default.

Start with step 1 & 2.
