/* 防暗色模式首帧白闪：在 CSS/JS bundle 加载前读 localStorage 提前挂 .dark。
 * 必须是外链同源文件（CSP script-src 'self' 禁止内联）。 */
(function () {
  try {
    var raw = localStorage.getItem('shark-settings');
    var appearance = raw ? (JSON.parse(raw).state || {}).appearance : 'auto';
    var dark =
      appearance === 'dark' ||
      (appearance !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.background = '#000';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#1c1c1e');
    }
  } catch (e) {
    /* 私密模式下 localStorage 不可用：保持浅色 */
  }
})();
