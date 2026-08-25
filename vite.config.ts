import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** 规格 §6.3：生产构建注入 CSP（dev 注入会阻断 Vite HMR，故仅 build 生效）。
 * connect-src 放宽到 https: 是因为云备份中继地址由用户自行配置。 */
function injectCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    'connect-src \'self\' https:',
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig({
  // 相对 base：兼容 GitHub Pages 项目子路径部署与任意安装目录
  base: './',
  plugins: [
    react(),
    injectCsp(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '鲨鱼记账',
        short_name: '鲨鱼记账',
        description: '轻量、无广告、可离线、可备份的个人记账工具',
        lang: 'zh-CN',
        display: 'standalone',
        theme_color: '#F5C518',
        background_color: '#FFFFFF',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { host: true },
  build: { target: 'es2020' },
});
