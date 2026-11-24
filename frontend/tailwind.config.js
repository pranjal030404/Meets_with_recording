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
      },
      boxShadow: {
        'glow': '0 0 0 1px rgba(255, 255, 255, 0.10)',
        'glow-lg': '0 0 0 1px rgba(255, 255, 255, 0.14)',
        'card': '0 1px 0 rgba(255, 255, 255, 0.04) inset',
        'float': 'none',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out both',
        'fade-in-up': 'fadeInUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in-down': 'fadeInDown 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-down': 'slideDown 0.25s ease-out both',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-left': 'slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'aurora': 'none',
        'aurora-slow': 'none',
        'gradient-x': 'none',
        'float': 'none',
        'float-delayed': 'none',
        'float-slow': 'none',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'none',
        'wiggle': 'wiggle 0.5s ease-in-out',
        'pop': 'pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'shimmer': 'none',
        'spin-slow': 'spin 8s linear infinite',
        'ring-pulse': 'ringPulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bar-grow': 'barGrow 1.2s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          from: { opacity: '0', transform: 'translateY(-24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(32px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(40px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-40px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        aurora: {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(60px, -40px) scale(1.15)' },
          '100%': { transform: 'translate(-40px, 40px) scale(0.95)' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.4)' },
          '50%': { boxShadow: '0 0 24px 4px rgba(59, 130, 246, 0.25)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        pop: {
          from: { opacity: '0', transform: 'scale(0.6)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        ringPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.5)' },
          '70%': { boxShadow: '0 0 0 10px rgba(34, 197, 94, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
        },
        barGrow: {
          from: { transform: 'scaleY(0.3)' },
          to: { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
}
