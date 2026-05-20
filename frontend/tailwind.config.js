/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        bg: {
          base: '#070707',
          panel: '#121212',
          track: '#1C1C1E',
          elev: '#1A1A1A',
        },
        ink: {
          primary: '#FFFFFF',
          secondary: '#8E8E93',
          muted: '#52525B',
        },
        accent: {
          DEFAULT: '#FFD60A',
          hover: '#F0C808',
          danger: '#FF3B30',
        },
        border: {
          subtle: 'rgba(255,255,255,0.08)',
          active: 'rgba(255,214,10,0.5)',
        },
      },
      fontFamily: {
        display: ['Cabinet Grotesk', 'sans-serif'],
        sans: ['Satoshi', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(255,214,10,0.4)' },
          '50%': { boxShadow: '0 0 28px 6px rgba(255,214,10,0.3)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 240ms ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-glow': 'pulse-glow 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
