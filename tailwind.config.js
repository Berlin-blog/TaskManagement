/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe7ff', 200: '#bcd0ff', 300: '#8fb0ff',
          400: '#5b86fb', 500: '#3a63f0', 600: '#2548d8', 700: '#1e3bb0',
          800: '#1f338c', 900: '#1f3070',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.06)',
        soft: '0 2px 10px rgba(15,23,42,.05)',
      },
      borderRadius: {
        xl: '14px',
      },
    },
  },
  plugins: [],
};
