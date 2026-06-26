/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page:  '#0d0e16',
        card:  '#141620',
        panel: '#1a1c2a',
        surface: '#20223a',
        border: '#2a2d40',
        yellow: '#f5c518',
        cyan:   '#00b4d8',
        muted:  '#6b7280',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
