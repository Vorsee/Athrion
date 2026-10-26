/** @type {import('tailwindcss').Config} */

// Colour tokens are CSS variables (RGB channels) defined in src/index.css for
// dark (:root) and light (.light), so `bg-surface/80`-style opacity still works.
const token = name => `rgb(var(--${name}) / <alpha-value>)`
const TOKENS = [
  'canvas', 'surface', 'raised', 'overlay', 'inset', 'line', 'line-strong',
  'ink', 'ink-2', 'muted', 'placeholder',
  'neon', 'neon-press', 'on-neon', 'neon-ink', 'neon-stroke', 'neon-tint',
  'warn', 'danger', 'info', 'lilac', 'rose', 'ember',
]

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        xs: '390px',   // iPhone 14 and up (SE = 375px, gets the base styles)
      },
      colors: Object.fromEntries(TOKENS.map(t => [t, token(t)])),
      fontFamily: {
        dm: ['"DM Sans Variable"', '"DM Sans"', 'sans-serif'],
      },
      // html font-size drops to 14px on narrow phones; keep meta text at 12px or more
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }], // table headers and badge descriptions only
        xs: ['max(0.75rem, 12px)', { lineHeight: '1rem' }],
      },
      // 10 chips and tags, 14 buttons, inputs and rows, 20 cards, 28 sheet tops
      borderRadius: {
        sm: '10px',
        DEFAULT: '10px',
        md: '10px',
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
        '3xl': '28px',
      },
      opacity: { 8: '0.08', 12: '0.12', 35: '0.35' },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      spacing: {
        'safe-top':    'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left':   'env(safe-area-inset-left)',
        'safe-right':  'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [],
}
