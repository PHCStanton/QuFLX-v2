# QuFLX v2 – Screenshot & Markup Enhancements Plan

**Date:** 2026-01-21  
**Status:** Implemented  
**Audience:** Product Owner, Engineering, AI/Automation  
**Scope:** `gui/Dashboard/src/components/ScreenshotModal.jsx` and related Ask AI linkage

---

## 1. Executive Summary

This plan upgrades the QuFLX **Chart Screenshot** workflow to improve:

- **Usability**: faster, clearer markups (more shapes, font sizing, color selection).
- **Explainability**: optional **notes space** that is interactive (tools work there).
- **AI value**: predictable and controllable linkage between **annotated screenshots** and **Ask AI responses**.

Key user feedback captured:

1. There is occasionally unused horizontal space (a “gutter”) near screenshots; if it exists, it should be **intentionally usable** (notes) or **optionally removed** (crop).
2. Markup tools need a few core additions:
   - Circle tool
   - Basic font size control
   - Expanded color palette (Blue, White, Yellow, Green)
   - Emoji support (optional)
3. Ask AI should have a clear model for whether it uses:
   - A live snapshot, or
   - The latest annotated screenshot, or
   - No image

### Completion Status (2026-01-21)

- [x] Notes Margin (interactive canvas area)
- [x] Crop / Export mode (crop to chart only)
- [x] Markup enhancements (circle, font size, color palette)
- [~] Emoji support (best-effort rendering depends on OS)
- [x] Ask AI image linkage (Live / Annotated / None with fallback)

---

## 2. Current State (Updated)

### 2.1 Screenshot Capture

- The chart capture uses `html2canvas` on the DOM root `quflx-chart-screenshot-root`.
- The Screenshot Modal renders a `<canvas>` sized to the captured image’s pixel dimensions.

Relevant files:

- `useScreenshotCapture` captures the image: `gui/Dashboard/src/hooks/useScreenshotCapture.js`
- Screenshot editing happens here: `gui/Dashboard/src/components/ScreenshotModal.jsx`

### 2.2 Markup Tools

Current tools in Screenshot Modal:

- Line
- Arrow
- Rect
- Circle
- Text (inline entry + click-to-place)
- Undo / Clear / Save

Constraints:

- Canvas includes an optional notes margin that is part of the interactive area.
- Text and shapes use configurable color and text font size.

### 2.3 Ask AI Linkage

- Ask AI image source is configurable: Live snapshot / Latest annotated / None.
- Latest annotated screenshot is captured when saving from the screenshot editor.

Implementation references:

- `useAIChat` builds prompt+context and calls Ask AI: `gui/Dashboard/src/hooks/useAIChat.js`
- Ask AI API client: `gui/Dashboard/src/api/aiClient.js`
- Backend gateway route: `backend/services/gateway/routes/ai.py`
- Backend provider wrapper: `backend/services/ai/service.py`

---

## 3. Goals & Non-Goals

### 3.1 Goals

1. Add a **Notes Margin** that is truly interactive (markups work inside it).
2. Provide a **Crop/Export mode** so users can output chart-only images when desired.
3. Add core markup enhancements:
   - Circle tool
   - Basic font size selection
   - Expanded palette (Blue, White, Yellow, Green)
   - Emoji support in text
4. Define and implement a predictable **screenshot-to-AI linkage**:
   - Live snapshot
   - Latest annotated screenshot
   - No image

### 3.2 Non-Goals

- No full-featured image editor (layers, advanced fonts, freehand brush) in this iteration.
- No heavy emoji-picker dependency unless explicitly requested.
- No multi-screenshot conversation history persistence in this plan (future enhancement).

---

## 4. Proposed UX

### 4.1 Notes Margin (Intentional “Extra Space”)

Instead of relying on accidental gutter space from layout, add a controlled “Notes Margin” option.

**Behavior**:

- Toggle: **Notes Margin ON/OFF**
- When ON:
  - Canvas width becomes `imageWidth + notesMarginWidth`.
  - Chart image is drawn on the left.
  - The right margin is a blank writable area for callouts, notes, checklist items.
  - Existing tools operate across both chart area and margin.

**Why**:

- Solves the “tools don’t work in the space” problem by making the space part of the canvas.
- Produces screenshots that are better for both the user and the AI (structured notes live next to chart).

### 4.2 Crop / Export Modes

Add save/export options:

- **Save: Full (Chart + Notes Margin)**
- **Save: Crop to Chart Only**

Crop should remove:

- Notes margin (if present)
- Optional outer padding/background

### 4.3 Markup Toolbar Enhancements

Add:

- **Circle tool** (ellipse)
- **Font Size selector** (preset values only)
- **Color palette selector**

Minimal recommended palette:

- Orange (current)
- Blue
- White
- Yellow
- Green

### 4.4 Emoji Support (Optional)

Emoji support can work with the current approach:

- Emojis are normal Unicode characters.
- Canvas `fillText` will render them if the OS supports the glyph.

Recommended approach:

- Allow users to paste emojis via OS picker (Windows: `Win + .`).
- Optionally provide a small “quick emoji strip” (✅ ❌ ⚠️ 📌 🔥 💡) without external dependencies.

---

## 5. Technical Design

### 5.1 Data Model for Shapes

Extend existing shape objects to include:

- `color`
- `strokeWidth` (optional, can default)
- `fontSize` for text

Add a new shape type:

- `circle`

### 5.2 Drawing Algorithm Changes

- Store active UI state:
  - `activeTool`
  - `activeColor`
  - `activeFontSize`
- When committing a shape, persist tool settings onto the shape.
- Rendering uses each shape’s stored settings.

### 5.3 Notes Margin Implementation

Add state:

- `notesMarginEnabled: boolean`
- `notesMarginWidth: number` (e.g., 320)

Canvas sizing rules:

- `canvas.width = img.width + (notesMarginEnabled ? notesMarginWidth : 0)`
- `canvas.height = img.height`

Redraw rules:

- Clear canvas
- Draw chart image at (0,0)
- If notes enabled:
  - Fill margin background (e.g., dark gray)
  - Optional vertical divider line
- Draw shapes

### 5.4 Crop on Save

If “Crop to chart only”:

- Create an offscreen canvas sized `(img.width, img.height)`.
- Draw the *current* main canvas onto it with `drawImage(mainCanvas, 0,0,img.width,img.height, 0,0,img.width,img.height)`.
- Export that offscreen canvas.

This approach crops out the notes margin while preserving markups on the chart region.

### 5.5 Ask AI Linkage Design

Current behavior:

- Ask AI captures a new image and sends it with context.

Target behavior:

- Ask AI includes an image based on user preference:
  - **Live Snapshot** (current chart)
  - **Latest Annotated Screenshot** (from Screenshot Modal)
  - **No Image**

Implementation options:

1. Store `lastAnnotatedScreenshotDataUrl` in the UI store when the Screenshot Modal saves.
2. Add an Ask AI toggle in the Ask prompt UI:
   - “Use annotated screenshot”
3. On Ask AI:
   - If toggle ON and last annotated exists, send that.
   - Else send live snapshot (or none).

---

## 6. Phased Implementation Plan

### Phase 1: Markup Controls (Low Risk, High Value) [x]

Deliver:

- Color palette selector
- Font size selector (presets)
- Persist settings into shape objects

Acceptance:

- Text and shapes render with the selected color.
- Text renders with the selected font size.
- Undo/Clear continue to work.

### Phase 2: Circle Tool [x]

Deliver:

- Add tool “Circle”
- Render ellipse using bounding rectangle and stroke

Acceptance:

- Circle can be drawn at any size and is rendered correctly after mouse-up.
- Circle obeys selected color.

### Phase 3: Notes Margin (Intentional Space) [x]

Deliver:

- Notes Margin toggle
- Canvas resizing + background rendering

Acceptance:

- When Notes Margin is enabled, tools work inside the margin.
- The margin is included in “Save Full”.

### Phase 4: Crop / Export Options [x]

Deliver:

- “Save Full” vs “Crop to Chart Only” option

Acceptance:

- Cropped export contains only chart region (no margin).
- Markups on the chart remain present in the crop.

### Phase 5: Emoji Support (Optional) [~]

Deliver:

- Allow emojis in text prompt
- Optional quick emoji strip

Acceptance:

- Pasted emojis render correctly in most environments.

### Phase 6: Ask AI Linkage Improvements [x]

Deliver:

- Toggle to use latest annotated screenshot for Ask AI
- Clear UX explanation of what image is being sent

Acceptance:

- Ask AI response is consistently based on the selected image source.
- If no annotated screenshot exists, the UI falls back gracefully.

---

## 7. Testing Strategy

### Automated

- Dashboard lint: `npm run lint`
- Dashboard QA: `npm run test:qa`

### Manual

- Capture screenshot, draw each tool, save, verify file created.
- Enable Notes Margin, place text in margin, save full.
- Save crop, verify margin removed.
- Ask AI using live snapshot and annotated screenshot, verify response references the visible annotations.

---

## 8. Risks & Mitigations

1. **Canvas scaling / DPI mismatches**
   - Mitigation: keep drawing in canvas pixel coordinates; continue using the existing bounding-box scaling logic.

2. **Emoji rendering differences per OS**
   - Mitigation: treat as best-effort and avoid external dependencies; provide fallback guidance.

3. **User confusion about what image was sent to AI**
   - Mitigation: display an explicit label in Ask AI UI: “Image source: Live / Annotated / None”.

---

## 9. Implementation References

- Screenshot editor: `gui/Dashboard/src/components/ScreenshotModal.jsx`
- Screenshot capture: `gui/Dashboard/src/hooks/useScreenshotCapture.js`
- Ask AI client: `gui/Dashboard/src/api/aiClient.js`
- Ask AI gateway: `backend/services/gateway/routes/ai.py`
- AI provider wrapper: `backend/services/ai/service.py`

---

## 10. Next Recommendations

- [ ] Replace all `window.prompt` UX with a dedicated Ask AI modal/panel
- [ ] Add redo (currently Undo only) and session persistence for markups
- [ ] Persist last annotated screenshot across refresh (store data URL/path)
- [ ] Add keyboard shortcuts (Esc close, Ctrl+Z undo, Ctrl+S save)
- [ ] Add a small on-screen label for AI image source (not only in prompt text)
- [ ] Add optional “Save As” naming (asset/timeframe/timestamp presets)
