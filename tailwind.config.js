/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        muted: 'var(--muted)',
      },
    },
  },
  plugins: [],
};
