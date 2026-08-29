/**
 * Supabase 反向代理 Worker（部署到 Cloudflare Workers，免费额度即可）
 *
 * 背景：国内部分 ISP/校园网对 *.supabase.co 做 DNS 污染，应用无法直连认证/数据库 API。
 * 本 Worker 把你自己的一个域名原样转发到 Supabase 项目，supabase-js 无感工作。
 *
 * 部署：
 *   1. dash.cloudflare.com → Workers & Pages → Create Worker（名字随意，如 shark-supabase）→ Deploy
 *   2. Edit code → 清空，粘贴本文件全部内容 → Deploy
 *   3. 回到 Worker 概览页，拿到访问域名（如 shark-supabase.xxx.workers.dev）
 *   4. 把 VITE_SUPABASE_URL 改为 https://shark-supabase.xxx.workers.dev 重新构建即可
 *
 * 安全说明：Worker 只做透明转发，不接触任何明文（账单数据在客户端已加密）；
 * 频控/认证/数据隔离仍由 Supabase 服务端承担。上游项目固定写死，不会被当开放代理滥用。
 */
const UPSTREAM_HOST = 'iftydqksqnjdwqkhnquil.supabase.co';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = UPSTREAM_HOST;
    url.protocol = 'https:';
    url.port = '';
    return fetch(new Request(url, request), { redirect: 'follow' });
  },
};
