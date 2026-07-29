/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        neon: '#C8F135',
      },
      fontFamily: {
        bebas: ['"Bebas Neue"', 'sans-serif'],
        dm: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
