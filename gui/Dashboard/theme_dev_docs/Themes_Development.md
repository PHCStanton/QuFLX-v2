# Dashboard Theme Development

## Overview

The Dashboard currently supports two visual themes for the main UI shell (excluding Lightweight Charts):

- **Default** – baseline dark theme aligned with Risk Manager styling.
- **Órange Dark** – experimental, gradient-driven dark theme inspired by modern fintech dashboards.

The theme system is implemented via CSS variables and a root-level modifier class applied to the `<html>` element. Components use Tailwind utility classes that resolve to these variables.

## Implementation Details

### 1. Theme Variables

Defined in `src/index.css` using RGB triplets:

```css
:root {
  --dashboard-bg: 15 20 25;
  --card-bg: 26 31 46;
  --text-primary: 248 250 252;
  --text-secondary: 148 163 184;
}

.theme-orange-dark {
  --dashboard-bg: 4 5 10;
  --card-bg: 17 14 24;
  --text-primary: 249 250 251;
  --text-secondary: 161 172 187;
}
```

- `:root` holds the **Default** palette.
- `.theme-orange-dark` overrides those variables when active.

### 2. Tailwind Color Tokens

`tailwind.config.js` maps semantic color names to the CSS variables:

```js
extend: {
  colors: {
    'dashboard-bg': 'rgb(var(--dashboard-bg) / <alpha-value>)',
    'card-bg': 'rgb(var(--card-bg) / <alpha-value>)',
    'accent-green': '#10b981',
    'accent-red': '#ef4444',
    'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
    'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
  }
}
```

All main layout surfaces use these tokens:

- App shell background – `bg-dashboard-bg` (`src/App.jsx`).
- Main workspace container – `bg-dashboard-bg` and `text-text-primary` (`src/components/Dashboard.jsx`).
- Shared cards, TopBar, Sidebar – `bg-card-bg` plus theme-specific helper classes.

### 3. Theme Toggle Behaviour

The toggle UI lives in `src/components/TopBar.jsx`. Local state tracks the current theme and applies the modifier class to the root HTML element:

```jsx
const [theme, setTheme] = useState('default');

useEffect(() => {
  const root = document.documentElement;
  if (theme === 'orange-dark') {
    root.classList.add('theme-orange-dark');
  } else {
    root.classList.remove('theme-orange-dark');
  }
}, [theme]);
```

Toggle labels:

- `Default`
- `Órange Dark`

This approach keeps theme selection entirely client-side and does not persist between reloads (intentionally simple for development preview).

### 4. Gradient and Depth Helpers

To avoid scattering complex gradient strings across JSX, helper classes are defined in `src/index.css`:

```css
.quflx-card {
  background-color: rgb(var(--card-bg));
}

.theme-orange-dark .quflx-card {
  background-image:
    radial-gradient(circle at top left, rgba(251, 146, 60, 0.32), transparent 60%),
    radial-gradient(circle at bottom right, rgba(248, 113, 113, 0.24), transparent 55%);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
}

.quflx-topbar {
  background-color: rgb(var(--card-bg));
}

.theme-orange-dark .quflx-topbar {
  background-image:
    linear-gradient(90deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.72)),
    radial-gradient(circle at top left, rgba(251, 146, 60, 0.4), transparent 55%);
}

.quflx-sidebar {
  background-color: rgb(var(--card-bg));
}

.theme-orange-dark .quflx-sidebar {
  background-image:
    linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.76)),
    radial-gradient(circle at bottom, rgba(16, 185, 129, 0.28), transparent 55%);
}
```

Components opt into these helpers via simple class names:

- `Card.jsx` wraps content in `quflx-card`.
- `TopBar.jsx` top header uses `quflx-topbar`.
- `Sidebar.jsx` shell uses `quflx-sidebar`.

This keeps the theme logic centralized and makes it trivial to adjust gradient parameters later.

### 5. Grey Contrast Sections

The design references a "trendy grey" palette with:

- Dark greys around `#161616`, `#252525`.
- Mid greys around `#808080`, `#AFAFAF`.
- Light greys around `#E1E1E1`.

In the Dashboard, lighter grey sections are introduced by:

- Using `bg-gray-800` + `border-gray-700` for control strips inside dark cards.
- Reserving true black/near-black for the global backdrop and keeping interactive areas slightly lighter.

Future improvements can add dedicated helpers (for example, `.quflx-section-light`) that map directly to a specific grey gradient derived from this palette if we standardize on exact hex values.

## Design Principles

- **Separation of Concerns** – Theme variables and helpers live in `index.css` and `tailwind.config.js`; components only consume semantic classes.
- **Non-invasive** – Themes apply only to layout and UI chrome. Trading charts (Lightweight Charts) keep their existing color scheme.
- **Preview-friendly** – Órange Dark is intentionally implemented as a non-persistent, developer-oriented preview toggle.
- **Easy Reversion** – Switching back to Default theme is instant at runtime, and reverting implementation is a one-file change in CSS/Tailwind if needed.
