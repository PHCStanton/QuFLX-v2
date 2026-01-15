# Skins — Development Index (v0 → vN)

## Purpose
Define the implementation plan for “Skins” (sidebar background images) and the future “image → color palette → UI theme” pipeline.

## Terminology
- Skin: User-selected background image applied to the left collapsable sidebar.
- Palette: A small set of colors extracted from an image.
- Theme tokens: Semantic CSS variables used across the UI (backgrounds, text, borders, accent).

## Current UI Baseline
- Sidebar background is implemented via `.quflx-sidebar::before` background-image in [index.css](file:///c:/QuFLX/v2/gui/Dashboard/src/index.css).
- Settings state is managed by Zustand and persisted to localStorage in [settingsStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/settingsStore.js).

## v0 Scope (This Version)
### Feature: “Add Skin” (Sidebar Background Upload)
- Location: Settings → Global Settings → under Theme.
- Input: Upload image (recommended 16:9).
- Storage: localStorage via the existing persisted settings store.
- Application: CSS variable on the sidebar container; pseudo-element uses that variable.

### Data Model (Local-only)
- `settings.global.sidebarSkinDataUrl: string | null`
  - Data URL (base64) of the uploaded image.
  - When null, fall back to theme defaults.

### Constraints
- Prefer images ≤ 2–5 MB to avoid localStorage quota issues.
- Supported formats: jpeg/png/webp.
- Apply via `background-size: cover` and `background-position: center`.

### Backend Interaction Policy
- Sidebar skin is local-only.
- Do not send `sidebarSkinDataUrl` to `/api/v1/settings`.
- Do not allow backend responses to overwrite `sidebarSkinDataUrl`.

## v1+ (Future Enhancements)

### Enhancement: Skin Controls
- Opacity slider for sidebar background overlay.
- Blur toggle/slider.
- Position controls (center/top/left).
- Quick presets (existing “cellphone case” designs).

### Enhancement: Palette Extraction
#### Goal
Extract a stable palette from an uploaded image and generate readable theme tokens.

#### Suggested Pipeline
1. Decode image into a canvas (downscale to ~128–256px max dimension).
2. Sample pixels (stride sampling, skip fully transparent).
3. Quantize colors into K clusters (K=6–10).
4. Produce palette roles:
   - Dominant
   - Secondary
   - Accent
   - Neutral dark
   - Neutral light

#### Token Generation (Theme Mapping)
Map palette roles into semantic tokens (examples):
- `--dashboard-bg`
- `--card-bg`
- `--section-bg`
- `--text-primary`
- `--text-secondary`
- `--border-primary`
- `--accent`
- `--accent-glow`

#### Readability & Safety Rules
- Enforce contrast thresholds for text/background combinations.
- Clamp saturation for large surfaces (avoid neon backgrounds).
- If contrast fails, fall back to:
  - existing theme defaults, or
  - derived neutralized variants.

#### Persistence
- Store only the minimal palette + derived tokens.
- Avoid storing large images in theme tokens.

### Enhancement: Apply Theme From Image
- Implement a theme “layer” that sets CSS variables at app root.
- Make skins independent from themes (image can drive both or only sidebar).

## Non-goals
- Full theme editor UI in v0.
- Server-side storage/sync of skins in v0.

