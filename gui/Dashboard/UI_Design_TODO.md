# UI Design Refinement TODO

## Dashboard Aesthetic: Blue and Dark with White Gap Layout

- [x] **Dashboard Background & Layout**
  - [x] Set `--dashboard-bg` to white (`255 255 255`) in `index.css`.
  - [x] Ensure panels have distinct shadows to create the 3D "floating" effect.
  - [x] Remove background image from the right sidebar (`.quflx-right-panel`).
  - [x] Apply `3D_Perspective_BG.jpg` to the Light Theme's left sidebar.

- [x] **Neomorphic Switch Refinement**
  - [x] Update track color to `rgb(22, 8, 241)`.
  - [x] Ensure horizontal part (track) uses the new color while maintaining neomorphic depth.

- [x] **Indicator Resize Handles**
  - [x] Enhance visibility of the resize handle in `ChartWorkspace.jsx`.
  - [x] Implement synchronized resizing: Main chart and oscillator panels must move together.
  - [x] Add a "grip" icon or distinct color line to the handle.

- [x] **Performance & Optimization Audit**
  - [x] Audit CSS for excessive `backdrop-filter` or complex gradients.
  - [x] Verify functional simplicity according to `CORE_PRINCIPLES.md`.
  - [x] Check for GPU latency issues.
