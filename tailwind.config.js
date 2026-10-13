/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        muted: '#66758a',
        line: '#dbe4ed',
        surface: '#ffffff',
        canvas: '#f4f7fb',
        navy: '#102e5f',
        teal: {
          DEFAULT: '#087c91',
          dark: '#056879',
          pale: '#e7f5f6',
        },
        red: {
          DEFAULT: '#b3262c',
          pale: '#fff0f1',
        },
        amber: {
          DEFAULT: '#9b6512',
          pale: '#fff6e6',
        },
        green: {
          DEFAULT: '#16734b',
          pale: '#e8f6ef',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
