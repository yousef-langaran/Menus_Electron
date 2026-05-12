/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['iranyekan', 'system-ui', 'sans-serif'],
      },
    },
  },
  darkMode: 'class',
};
