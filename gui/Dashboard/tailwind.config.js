/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors based on the Risk Manager Design
        'dashboard-bg': '#0f1419', // Matches RiskManager main bg
        'card-bg': '#1a1f2e', // Matches RiskManager card/nav bg
        'accent-green': '#10b981', // emerald-500
        'accent-red': '#ef4444', // red-500
        'text-primary': '#f8fafc', // slate-50
        'text-secondary': '#94a3b8', // slate-400
      }
    },
  },
  plugins: [],
}
