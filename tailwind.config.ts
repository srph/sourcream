import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#111311', foreground: '#f2f3ed', muted: '#999d94', accent: '#d9ef91', line: '#30342c',
        panel: '#1d201a', raised: '#252b20', control: '#30352b',
      },
      screens: { tv: '1600px' },
    },
  },
  plugins: [],
} satisfies Config;
