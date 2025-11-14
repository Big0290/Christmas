/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        christmas: {
          red: '#c41e3a',
          green: '#0f8644',
          gold: '#ffd700',
          snow: '#f0f8ff',
        },
      },
      animation: {
        'snow-fall': 'snowfall 10s linear infinite',
        'confetti': 'confetti 3s ease-in-out',
      },
      keyframes: {
        snowfall: {
          '0%': { transform: 'translateY(-100vh)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        confetti: {
          '0%': { transform: 'translateY(0) rotateZ(0deg)', opacity: 1 },
          '100%': { transform: 'translateY(100vh) rotateZ(720deg)', opacity: 0 },
        },
      },
    },
  },
  plugins: [],
};
