# Supabase 账号同步配置指南

账号模式使用 [Supabase](https://supabase.com)（开源 BaaS，免费额度足够个人使用）作为认证与云端存储后端。
**未配置时应用行为完全不变**：所有数据仍只存本机，设置页不显示「账号与云同步」入口。

## 安全模型（为什么这是"工业生产标准"）

| 层 | 机制 |
| --- | --- |
| 认证 | Supabase Auth（GoTrue）：密码以 bcrypt 散列存于服务端，应用/数据库均不接触明文；支持邮箱确认、找回密码、会话自动刷新 |
| 数据隔离 | Postgres **行级安全（RLS）**：每行绑定 `auth.uid()`，任何请求（即使拿到 anon key）只能读写自己的那一行 |
| 数据机密性 | 账单快照在上传前用你的「数据口令」做 **PBKDF2-SHA256（60 万轮）+ AES-256-GCM** 客户端加密，Supabase 只存密文（零信任） |
| 前端 | anon key 本就是公开密钥，构建期注入不构成泄密；安全边界在 RLS，不在密钥保密 |

## 一、创建项目与建表

1. 注册/登录 [supabase.com](https://supabase.com) → New project（记下数据库密码，区域选近的）。
2. 左侧 **SQL Editor** → New query → 粘贴以下语句 → Run：

```sql
-- 用户级加密快照表：每个登录用户一行（可重复执行：先删旧策略再建）
create table if not exists public.vaults (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  cipher      text        not null,                -- 加密后的整库快照 JSON
  updated_at  timestamptz not null default now(),
  app_version text
);

alter table public.vaults enable row level security;

drop policy if exists "vault_select_own" on public.vaults;
create policy "vault_select_own" on public.vaults
  for select using (auth.uid() = user_id);
drop policy if exists "vault_insert_own" on public.vaults;
create policy "vault_insert_own" on public.vaults
  for insert with check (auth.uid() = user_id);
drop policy if exists "vault_update_own" on public.vaults;
create policy "vault_update_own" on public.vaults
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "vault_delete_own" on public.vaults;
create policy "vault_delete_own" on public.vaults
  for delete using (auth.uid() = user_id);
```

3. **Authentication → Providers**：确认 Email 登录已启用（默认启用）。
   - 生产环境建议在 **Authentication → Sign In / Up** 开启邮箱确认（默认开启）。
   - **Authentication → URL Configuration → Site URL** 填你的部署地址
     （如 `https://joshjeoa.github.io/shark-ledger/`），找回密码邮件里的链接才能跳回应用。

## 二、拿到密钥

**Project Settings → API Keys**（新版界面）：

- `Project URL` → `VITE_SUPABASE_URL`（Data API 区块，形如 `https://xxxxx.supabase.co`）
- **Publishable key**（`sb_publishable_...` 开头，可公开）→ `VITE_SUPABASE_ANON_KEY`

> 旧版界面在「Legacy anon, service_role API keys」标签页里，`anon public` key（`eyJ...` 开头）同样可用。
> **`service_role` / `sb_secret_` 开头的是服务器机密密钥，绝不放进前端配置。**

## 三、注入构建

### 本地开发

项目根目录建 `.env.local`（已被 .gitignore 忽略，不会提交）：

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### GitHub Pages 部署

仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加两条：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`.github/workflows/deploy.yml` 的构建步骤已配置为从 Secrets 注入这两个变量。

## 四、使用与语义

- 设置 → **账号与云同步** → 注册/登录（首次登录自动做一次云端合并同步）。
- **数据口令**：用于加密云端快照，仅保存在本设备；换设备登录后需重新输入同一口令才能解密。
  留空则明文上传（依赖 RLS 保护，不推荐）。
- **同步策略**：拉取云端 → 与本机按 id 并集、同 id 取记账时间（updatedAt）大者合并 → 推回。
  两端都不会被静默覆盖。新安装设备（本地零账单）登录时直接采用云端整库，避免种子分类与云端分类重复。
- 记一笔后约 5 秒自动同步；网络恢复时补跑；凭证照片不参与云同步（体积原因，仅存本机）。
- 「删除云端数据」仅删除云端快照行，本机数据不动。

## 五、国内网络直连不通怎么办（重要）

国内部分 ISP/校园网对 `*.supabase.co` 做 DNS 污染（症状：官网能打开，但应用里登录/注册提示「网络连接失败」，
`nslookup 你的项目ref.supabase.co` 返回 Non-existent domain）。解决：用 Cloudflare Worker 反向代理（免费）：

1. 注册/登录 [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages → Create application → Create Worker**，名字随意（如 `shark-supabase`）→ Deploy
3. **Edit code** → 清空示例，粘贴仓库文件 `deploy/supabase-proxy-worker.js` 的全部内容（把里面的
   `UPSTREAM_HOST` 保持为你的项目域名）→ **Deploy**
4. 回 Worker 概览页拿到访问域名（形如 `shark-supabase.xxx.workers.dev`）
5. 把 `VITE_SUPABASE_URL` 改为 `https://shark-supabase.xxx.workers.dev`，重新构建

说明：Worker 只做透明转发，数据在客户端已加密；若 `workers.dev` 域名在你所在网络也不通，
需要在 Cloudflare 给 Worker 绑定自己的自定义域名（需一个托管在 Cloudflare 的域名）。

## 六、故障排查

| 现象 | 原因/处理 |
| --- | --- |
| 设置页没有「账号与云同步」 | 构建时两个环境变量未注入（检查 .env.local 或 Actions Secrets） |
| 登录报「请先打开邮箱里的确认链接」 | 注册后需要点确认邮件（可在 Supabase Auth 用户列表手动确认） |
| 同步报「云端数据已加密，请先输入数据口令」 | 换设备后首次同步，填入原设备设置的数据口令 |
| 同步报「口令错误，无法解密备份」 | 数据口令与加密时不一致 |
| 找回密码邮件链接打不开应用 | Site URL 未配置为部署地址 |
