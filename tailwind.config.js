/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        xs: '390px',   // iPhone 14 and up (SE = 375px, gets the base styles)
      },
      colors: {
        neon: '#C8F135',
      },
      fontFamily: {
        bebas: ['"Bebas Neue"', 'sans-serif'],
        dm: ['"DM Sans"', 'sans-serif'],
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
