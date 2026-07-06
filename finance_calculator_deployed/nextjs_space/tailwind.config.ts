import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
      colors: {
        accent: 'var(--accent)',
        'accent-light': 'var(--accent-light)',
        'accent-hrs': 'var(--accent-hrs)',
        'accent-cr': 'var(--accent-cr)',
        'accent-hdg': 'var(--accent-hdg)',
        'accent-sum': 'var(--accent-sum)',
        skin: {
          bg: 'var(--bg)',
          panel: 'var(--bg-panel)',
          card: 'var(--bg-card)',
          input: 'var(--bg-input)',
        },
        brd: {
          DEFAULT: 'var(--border)',
          hi: 'var(--border-hi)',
        },
        txt: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          value: 'var(--text-value)',
        },
      },
    },
  },
  plugins: [],
};
export default config;
