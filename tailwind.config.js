/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        muted: 'var(--muted)',
        // 中性层
        surface: 'var(--surface)',
        card: 'var(--card)',
        fill: 'var(--fill)',
        line: 'var(--line)',
        // 文字
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        'on-primary': 'var(--on-primary)',
        // Header（浅色 = 品牌色，暗色 = 沉浸深色）
        header: 'var(--header-bg)',
        'header-ink': 'var(--header-ink)',
        'header-fill': 'var(--header-fill)',
        'header-fill-ink': 'var(--header-fill-ink)',
        // Toast / 遮罩
        'toast-bg': 'var(--toast-bg)',
        'toast-ink': 'var(--toast-ink)',
        scrim: 'var(--scrim)',
      },
    },
  },
  plugins: [],
};
