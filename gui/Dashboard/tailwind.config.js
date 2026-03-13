/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors based on the Risk Manager Design
        'dashboard-bg': 'rgb(var(--dashboard-bg) / <alpha-value>)',
        'card-bg': 'rgb(var(--card-bg) / <alpha-value>)',
        'section-bg': 'rgb(var(--section-bg) / <alpha-value>)',
        'accent-green': 'rgb(var(--accent-green, 34 197 94) / <alpha-value>)',
        'accent-red': '#ef4444', // red-500
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
        'border-primary': 'rgb(var(--border-color) / <alpha-value>)',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        sans: ['var(--font-primary)', 'ui-sans-serif', 'system-ui', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'],
        primary: ['var(--font-primary)'],
        secondary: ['var(--font-secondary)'],
        tertiary: ['var(--font-tertiary)'],
      }
    },
  },
  plugins: [],
}
