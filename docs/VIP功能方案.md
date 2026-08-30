# 鲨鱼记账 · 鲨鱼 Pro（VIP）功能方案

> 分期实施路线图。本文档是唯一事实来源：每期开工前对齐范围，完成后回填「状态」。
> 关联文档：`docs/supabase-setup.md`（账号体系）、`ITERATION_LOG.md`（实施记录）。

---

## 0. 设计原则（先读这个）

1. **免费核心永远不动**：记账、明细、基础图表、预算、CSV/JSON 导出、云备份、账号同步全部免费。Pro 只做锦上添花——工具类应用的信任感比短期收入值钱。
2. **壁垒优先级 = 服务端 > 客户端**：本应用是**纯前端 + 公开仓库（MIT）**，任何纯客户端的"锁"都能被开发者工具解开。因此：
   - 真正的 Pro 价值放在**依赖服务器**的功能上（照片云存储、AI），这些天然收得起钱、也防得住；
   - 纯客户端功能（无限账本、年度报告）的 Pro 判断只做**温和门槛**——挡得住随手白嫖，挡不住有心人，这是独立开发者工具的惯例，接受即可。
3. **自部署者即运维者**：没有配置 Supabase（`isAccountConfigured() === false`）的部署，客户端类 Pro 功能**自动视为已解锁**——自部署的人就是收款的人，锁自己没有意义。此时服务端类功能（照片云同步）整体隐藏。
4. **收费闭环先用兑换码**：个人开发者第一版不接支付 SDK。线下收款（爱发电/微信赞赏）→ 人工在 Supabase 里生成兑换码发给用户 → 用户在应用内输码开通。跑通后再考虑自动化。

---

## 1. 免费 / Pro 功能划分

| 功能 | 免费 | Pro | 壁垒 | 阶段 |
| --- | --- | --- | --- | --- |
| 记一笔 / 明细 / 搜索 / 回收站 | ✅ | — | — | — |
| 基础图表（趋势 / 构成 / 对比 / 排行） | ✅ | — | — | — |
| 预算 + 洞察、多账本（≤2 个） | ✅ | 无限账本 | 客户端 | P1 |
| CSV / JSON 导入导出、云备份 | ✅ | — | — | — |
| 账号 + 云端保险库同步 | ✅ | — | — | — |
| 凭证照片（本地） | ✅ | 照片云同步（跨设备） | 服务端（Storage + 配额） | P2 |
| 年度报告 + 分享卡片 | — | ✅ | 客户端 | P1 |
| 主题皮肤 / 应用图标扩展包 | 基础 5 色 | 扩展包 | 客户端 | P4 |
| AI 月度分析 / 拍小票记账 | — | ✅ | 服务端（API Key 中转） | P3（待定） |

---

## 2. 权益与兑换架构

### 2.1 数据库（Supabase SQL，可重复执行）

```sql
-- 兑换码池：由服务方线下生成插入（客户端无权直接读这张表）
create table if not exists licenses (
  code        text primary key,
  plan        text not null default 'yearly',   -- yearly | lifetime
  duration_days int,                            -- yearly 用；lifetime 为 null
  bound_user  uuid null,                        -- 绑定后写入；null=未使用
  bound_at    timestamptz null,
  note        text,
  created_at  timestamptz not null default now()
);
-- RLS：客户端对 licenses 无任何直接权限，只能走下面的 SECURITY DEFINER 函数
alter table licenses enable row level security;

-- 用户权益表：每用户一行
create table if not exists pro_entitlements (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'yearly',
  expires_at timestamptz null,                  -- lifetime 为 null（永久）
  code       text,
  updated_at timestamptz not null default now()
);
alter table pro_entitlements enable row level security;
drop policy if exists "read own entitlement" on pro_entitlements;
create policy "read own entitlement" on pro_entitlements
  for select using (auth.uid() = user_id);

-- 兑换：校验码 → 绑定当前用户 → 写权益（一个事务内完成）
create or replace function redeem_license(p_code text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_row licenses;
  v_exp timestamptz;
begin
  if auth.uid() is null then raise exception '未登录'; end if;
  select * into v_row from licenses where code = upper(trim(p_code));
  if not found then raise exception '兑换码不存在'; end if;
  if v_row.bound_user is not null and v_row.bound_user <> auth.uid() then
    raise exception '兑换码已被使用';
  end if;
  update licenses set bound_user = auth.uid(), bound_at = now()
    where code = v_row.code;
  if v_row.plan = 'lifetime' then
    v_exp := null;
  else
    -- 已有权益在续费：从当前到期日顺延（未过期）或从现在起算（已过期/首次）
    select expires_at into v_exp from pro_entitlements where user_id = auth.uid();
    v_exp := greatest(coalesce(v_exp, now()), now()) + make_interval(days => coalesce(v_row.duration_days, 365));
  end if;
  insert into pro_entitlements (user_id, plan, expires_at, code, updated_at)
    values (auth.uid(), v_row.plan, v_exp, v_row.code, now())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at,
      code = excluded.code, updated_at = now();
  return v_exp;
end; $$;

-- 生成兑换码的辅助函数（服务方在 SQL Editor 里调用，例：select gen_license('yearly', 365, '首批用户');）
create or replace function gen_license(p_plan text, p_days int, p_note text default null)
returns text language plpgsql as $$
declare v_code text;
begin
  v_code := 'SHARK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' || substr(md5(random()::text), 1, 4));
  insert into licenses (code, plan, duration_days, note) values (v_code, p_plan, p_days, p_note);
  return v_code;
end; $$;

-- 固定测试码（自测用；正式运营前删除：delete from licenses where code like 'SHARK-TEST-%';）
insert into licenses (code, plan, duration_days, note) values
  ('SHARK-TEST-2026', 'yearly', 365, '测试年卡'),
  ('SHARK-TEST-LIFETIME', 'lifetime', null, '测试永久')
on conflict (code) do nothing;
```

**照片云同步额外需要（P2）**：Storage 私有桶 + 按用户隔离的策略：

```sql
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
-- 第一条策略建好后，后续 drop policy if exists 可重复执行
create policy "own photo folder" on storage.objects for all
  using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
```

### 2.2 客户端权益层（`src/vip/`）

| 文件 | 职责 |
| --- | --- |
| `entitlement.ts` | Zustand store（不持久化，登录后从云端拉取）：`refreshEntitlement()` 登录/启动时查 `pro_entitlements`；`redeemCode()` 调 RPC 后刷新；`isPro()` 综合判断（含测试开关，见下） |
| `ProGate.tsx` | `<ProGateButton feature="...">` 包装按钮：Pro 用户直接执行 onClick；免费用户弹「升级鲨鱼 Pro」面板（功能卖点 + 兑换码输入 + 登录引导）。面板本身是普通 Sheet，无需门槛 |

**Pro 判定顺序**：未配置账号体系 → 视为 Pro（自部署豁免，见原则 3）；localStorage `shark-pro-override = '1'` → 视为 Pro（**自测开关**，公开仓库里客户端锁本就只防君子，这个开关方便开发/自测）；登录后看 `pro_entitlements.expires_at`（null = 永久有效）。

**入口**：设置页新增「鲨鱼 Pro」行（`isAccountConfigured()` 时显示），显示当前状态（未开通 / 有效期至 x / 永久）；ProGate 拦截处也都能进升级面板。

### 2.3 收款闭环（运营侧，非代码）

1. 爱发电 / 微信赞赏码收款（建议定价：¥12/年、¥30 永久，随功能增加上调）。
2. 收到款后在 Supabase SQL Editor 执行 `select gen_license('yearly', 365, '订单号xxx');` 拿到码发给用户。
3. 用户：设置 → 鲨鱼 Pro → 输入兑换码 → 即时生效（多设备登录同一账号均可）。

---

## 3. 分期实施

### Phase 1（本次）：权益层 + 无限账本 + 年度报告 — ✅ 已完成

- [x] SQL migration 写入本文档 §2.1（需你在 Supabase SQL Editor 执行后才可用兑换码）
- [x] `src/vip/entitlement.ts` + `ProGate` + 升级面板 + 设置页「鲨鱼 Pro」入口
- [x] 账本免费上限 2 个：`LedgersPage` 新建时拦截（已有账本不受影响，改名/删除/切换不受限）
- [x] 年度报告 `/report`（懒加载）：全年收入/支出/结余、记账笔数与天数、日均支出、最高单笔、最常记账分类、花销最高月份、12 个月收支柱状图、同比去年；Canvas 生成 1080×1440 分享卡片（深炭+香槟金主题）可保存到相册
- [x] 图表页头部新增「年报」入口（ProGate 拦截）

### Phase 2（本次）：凭证照片云同步 — ✅ 代码完成，待线上验证

- [x] Storage 桶 SQL（§2.1 尾部）
- [x] `src/vip/photoCloud.ts`（懒加载）：`uploadAll()`（幂等，云端已有则跳过）/ `downloadMissing()`；按用户路径 `uid/photoId` 上传原图（已压缩）
- [x] `repo.allPhotos()` / `repo.importCloudPhoto()`：照片从云端回落到本地 IndexedDB
- [x] 账号页新增「照片云同步」区块（ProGate）：本地/云端数量统计、立即上传 / 下载到本机、自动同步开关（记一笔后随保险库同步一起防抖执行）
- [ ] **线上端到端验证**（需要你先执行 §2.1 SQL 建桶，再兑换/测试码开通 Pro）

### Phase 3：AI 月度分析 / 拍小票记账 — ⏸ 待定

需要 LLM/OCR 的 API Key，经 Cloudflare Worker 中转（`deploy/` 有现成代理模式）。**开工前置条件：你确定 API 服务商并愿意承担按量成本**，再细化 prompt 与配额（Pro 用户每月 N 次）。数据出境与隐私提示需要在 UI 明示。

### Phase 4：主题皮肤扩展包 / 应用图标 — 未开工

低成本客户端门槛，放在有付费用户之后做（优先级最低）。

---

## 4. 验收标准

- AC-V1 未配置 Supabase 的部署：设置页无「鲨鱼 Pro」入口；账本新建不设限；年报入口直接可用（自部署豁免）。
- AC-V2 已配置 + 未登录：点 Pro 功能 → 升级面板引导先登录（一键跳账号页）。
- AC-V3 错误兑换码 / 已被他人使用的码：明确中文报错（「兑换码不存在」/「兑换码已被使用」），服务端校验为准。
- AC-V4 兑换成功：权益立即生效，设置页显示有效期；续费码在未到期时兑换 → 到期日顺延。
- AC-V5 免费用户已有 3 个账本（历史遗留）：不强制删除，只拦截「第 4 个新建」。
- AC-V6 年报分享卡片：1080×1440 PNG，深浅主题各自可读（卡片固定用暗色金融风，与主题无关）。
- AC-V7 照片云同步：上传幂等（重复点不重复流量）；换设备登录 + 下载后，凭证照片在明细/编辑页正常回显。

## 5. 风险与限制（诚实清单）

- **客户端门槛可被绕过**（公开仓库 + 静态前端），这是接受的定位；真正值钱的照片云同步/AI 由服务端资源自然限流。
- Supabase 免费档：Storage 1GB ≈ 约 5000 张压缩凭证照；超出需升费用档或做配额提示（P2 后续加"用量显示"）。
- 兑换码是人工发放，黑产批量倒卖风险低但存在；必要时给 `redeem_license` 加频率限制。
- 测试码 `SHARK-TEST-2026`（年卡）/ `SHARK-TEST-LIFETIME`（永久）写在 §2.1 的示例里，**正式运营前务必删除**（`delete from licenses where code like 'SHARK-TEST-%';`）。

---

*最后更新：v1.8.0（2026-08-30）。*
