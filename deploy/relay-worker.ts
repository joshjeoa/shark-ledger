/**
 * WebDAV CORS 中继（Cloudflare Worker）
 *
 * 背景：坚果云等 WebDAV 服务不返回 CORS 响应头，浏览器纯前端无法直连。
 * 部署：npx wrangler deploy deploy/relay-worker.ts （或在 CF Dashboard 粘贴本文件创建 Worker）
 * 客户端配置：relayUrl = https://<worker>.workers.dev
 *
 * 安全说明：中继不保存任何凭证，Authorization 由客户端每次请求携带并透传。
 * 必须配置环境变量防止被滥用为开放代理：
 *   ALLOW_ORIGINS  逗号分隔的前端站点 Origin，如 https://shark.pages.dev（不匹配返回 403）
 *   ALLOW_TARGET   允许的 WebDAV 主机，如 dav.jianguoyun.com（不匹配返回 403）
 * 配置方式：wrangler secret put ALLOW_ORIGINS / ALLOW_TARGET，或 wrangler.toml 的 [vars]
 */
interface Env {
  ALLOW_ORIGINS?: string;
  ALLOW_TARGET?: string;
}

const ALLOW_METHODS = 'GET,PUT,POST,DELETE,PROPFIND,OPTIONS';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,x-target',
    };
    const deny = (status: number, error: string) =>
      new Response(JSON.stringify({ error }), { status, headers: corsHeaders });

    // 来源白名单：仅允许配置的前端站点调用
    const origin = req.headers.get('origin') ?? '';
    const allowOrigins = (env.ALLOW_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allowOrigins.length && !allowOrigins.includes(origin)) return deny(403, 'origin not allowed');
    if (!allowOrigins.length) return deny(403, 'ALLOW_ORIGINS not configured');

    if (req.method === 'OPTIONS') {
      corsHeaders['Access-Control-Allow-Origin'] = origin || '*';
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const target = req.headers.get('x-target');
    if (!target || !/^https:\/\//.test(target)) return deny(400, 'missing x-target');

    // 目标主机白名单：仅允许配置的 WebDAV 域名
    let host = '';
    try {
      host = new URL(target).hostname;
    } catch {
      return deny(400, 'invalid x-target');
    }
    const allowTargets = (env.ALLOW_TARGET ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowTargets.length || !allowTargets.includes(host)) return deny(403, 'target host not allowed');

    corsHeaders['Access-Control-Allow-Origin'] = origin || '*';
    const headers = new Headers();
    const auth = req.headers.get('Authorization');
    if (auth) headers.set('Authorization', auth);
    const ct = req.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);
    headers.set('Depth', '1');
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });
      const res = new Response(upstream.body, { status: upstream.status });
      for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
      const contentType = upstream.headers.get('Content-Type');
      if (contentType) res.headers.set('Content-Type', contentType);
      return res;
    } catch {
      return deny(502, 'upstream unreachable');
    }
  },
};
