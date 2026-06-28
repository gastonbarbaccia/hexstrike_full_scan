/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0f1e',
        bg2:     '#111827',
        bg3:     '#1f2937',
        border:  '#1e3a5f',
        accent:  '#00d4ff',
        green:   '#22c55e',
        red:     '#ef4444',
        orange:  '#f97316',
        yellow:  '#eab308',
        purple:  '#a855f7',
        muted:   '#64748b',
      },
      fontFamily: {
        mono: ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
