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
        gray: { 50: '#f7f7f8', 100: '#ededee', 200: '#dcdcde', 300: '#c4c5c8', 400: '#a1a2a7', 500: '#85868c', 600: '#66676d', 700: '#46474d', 800: '#26272b', 900: '#1b1c1f' },
        slate: { 50: '#f7f7f8', 100: '#ededee', 200: '#dcdcde', 300: '#c4c5c8', 400: '#a1a2a7', 500: '#85868c', 600: '#66676d', 700: '#46474d', 800: '#26272b', 900: '#1b1c1f' },
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        fuchsia: { 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
        purple: { 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
        violet: { 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
        accent: {
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
        dark: {
          50: '#f3f3f4',
          100: '#0e0f11',
          200: '#141517',
          300: '#1b1c1f',
          400: '#26272b',
          500: '#34353a',
          600: '#4a4b51',
        }
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
