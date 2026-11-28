/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // one graphite ramp for every neutral
        gray: { 50: '#faf8f5', 100: '#f2eee8', 200: '#ddd8d0', 300: '#c4beb4', 400: '#a8a299', 500: '#a09a90', 600: '#8f897f', 700: '#4a4641', 800: '#2e2a26', 900: '#1a1917' },
        slate: { 50: '#faf8f5', 100: '#f2eee8', 200: '#ddd8d0', 300: '#c4beb4', 400: '#a8a299', 500: '#a09a90', 600: '#8f897f', 700: '#4a4641', 800: '#2e2a26', 900: '#1a1917' },
        primary: {
          50: '#fdf6ea',
          100: '#fae8c8',
          200: '#f6d8a2',
          300: '#f2c57a',
          400: '#edb256',
          500: '#e8a33d',
          600: '#d8932f',
          700: '#b87b22',
          800: '#8f5f1b',
          900: '#6b4714',
        },
        fuchsia: { 200: '#f6d8a2', 300: '#f2c57a', 400: '#edb256', 500: '#e8a33d', 600: '#d8932f', 700: '#b87b22' },
        purple: { 200: '#f6d8a2', 300: '#f2c57a', 400: '#edb256', 500: '#e8a33d', 600: '#d8932f', 700: '#b87b22' },
        violet: { 200: '#f6d8a2', 300: '#f2c57a', 400: '#edb256', 500: '#e8a33d', 600: '#d8932f', 700: '#b87b22' },
        accent: {
          300: '#f2c57a',
          400: '#edb256',
          500: '#e8a33d',
          600: '#d8932f',
        },
        dark: {
          50: '#f2eee8',
          100: '#121110',
          200: '#1a1917',
          300: '#211f1d',
          400: '#2e2a26',
          500: '#3d3833',
          600: '#524c45',
        },
        // text on amber and on off-white fills
        ink: '#1a1307'
      },
      fontFamily: {
        sans: ['Manrope', 'Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
        display: ['"Space Grotesk"', 'Manrope', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out both',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-down': 'slideDown 0.2s ease-out both',
        'slide-in-right': 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}
