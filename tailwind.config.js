/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], display: ['Manrope', 'Inter', 'sans-serif'], mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'] },
      borderRadius: { panel: 'var(--panel-radius)', DEFAULT: 'var(--radius)' },
      transitionTimingFunction: { brand: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      colors: {
        background: 'var(--background)', foreground: 'var(--foreground)',
        primary: { DEFAULT: 'var(--primary)', dark: 'var(--primary-dark)', light: 'var(--primary-light)' },
        secondary: 'var(--secondary)', surface: 'var(--surface)', 'surface-alt': 'var(--surface-alt)', ink: 'var(--ink)', line: 'var(--line)', accent: { DEFAULT: 'var(--accent)', dark: 'var(--accent-dark)', light: 'var(--accent-light)' }, card: 'var(--card)', border: 'var(--border)', muted: 'var(--muted)',
        success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', sidebar: 'var(--sidebar)',
      },
      boxShadow: { card: '0 1px 2px rgba(32,33,36,.04)', pop: '0 12px 32px -8px rgba(16,24,40,.18)' },
    },
  },
  plugins: [],
};
