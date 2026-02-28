import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Dark matte palette ─────────────────────────────
        surface: {
          DEFAULT: '#1a1a1e', // Main background
          raised: '#222226', // Cards, panels
          overlay: '#2a2a2f', // Modals, dropdowns
          sunken: '#141416', // Inset areas
        },
        border: {
          DEFAULT: '#2e2e33',
          subtle: '#252529',
          strong: '#3a3a40',
        },
        // ─── Warm accent (copper/amber) ─────────────────────
        accent: {
          DEFAULT: '#c87533',
          hover: '#d4863f',
          muted: '#9e5c28',
          subtle: 'rgba(200, 117, 51, 0.12)',
        },
        // ─── Text ───────────────────────────────────────────
        text: {
          primary: '#e8e6e3',
          secondary: '#9a9894',
          tertiary: '#6b6963',
          inverse: '#1a1a1e',
        },
        // ─── Semantic ───────────────────────────────────────
        success: '#4a9e6e',
        warning: '#c8a033',
        error: '#c85533',
        info: '#5588aa',
        // ─── Format quality colors ──────────────────────────
        quality: {
          lossless: '#4a9e6e', // Green — FLAC, ALAC, WAV
          high: '#5588aa', // Blue — V0, 320
          mid: '#c8a033', // Amber — V2, 256
          low: '#9a9894', // Gray — 192, 128
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
