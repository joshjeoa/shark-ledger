import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/** 规格 §6.3：生产构建注入 CSP（dev 注入会阻断 Vite HMR，故仅 build 生效）。
 * connect-src 放宽到 https: 是因为云备份中继地址由用户自行配置。 */
function injectCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
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
        theme_color: '#F2F2F7',
        background_color: '#F2F2F7',
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
        // 大体量懒加载块移出首装预缓存：访问对应功能后由下方运行时缓存接管离线
        globIgnores: ['assets/auto-*.js', 'assets/supabase-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-resources',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { host: true },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // supabase-js 单独成块：仅账号功能用户会下载，且移出 SW 预缓存
          if (id.includes('@supabase')) return 'supabase';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
