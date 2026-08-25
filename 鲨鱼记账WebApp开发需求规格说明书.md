# 鲨鱼记账 WebApp 开发需求规格说明书

> 版本 v2.0 ｜ 取代《鲨鱼记账WebApp提示词.md》，作为唯一执行蓝图
> 设备基线：iPhone 13 Pro Max ／ iOS 15.0+ ／ Safari 浏览器 & "添加到主屏幕"独立模式
> 视觉基线：随附 8 张参考截图（映射见附录 A）。不要求像素级复刻，但信息架构、核心交互、配色体系必须一致。

## 0. 文档用法

- 本文同时是"需求规格 + 提示词"：开工前整体喂给 AI 工程师；执行时按 §7 的 M1→M7 顺序逐阶段交付，**单阶段跑通验收后才进入下一阶段**。
- 条款三级：【硬】= 必须满足，违反即返工；【默认】= 已定决策，可改但必须说明理由与代价；【可选】= 时间允许再做。
- 全局约定：金额一律以**整数分**存储与计算，展示层格式化为元（2 位小数）；所有用户可见文案为中文；零广告、零会员、零外链、零后端、零备案服务。

## 1. 审查结论：原提示词问题 → 本规格决策

| # | 原文问题 | 风险 | 决策（详见章节） |
|---|---|---|---|
| 1 | 坚果云 WebDAV"纯前端可用"不成立：`dav.jianguoyun.com` 无 CORS 响应头，浏览器直连必被拦截 | 高 | SyncAdapter 抽象层；默认源改为 **GitHub Gist**（CORS 友好、零基建）；WebDAV 须经仓库自带的 Cloudflare Worker 中继脚本；R2 备选（§4.6） |
| 2 | `amount: number`（元、2 位小数）浮点累加必出错 | 高 | 改为整数分 `amountCents`（§4.3、§4.4） |
| 3 | IndexedDB 私密模式仅"降级 localStorage"：私密模式下 localStorage 同样不持久且 ≤5MB | 高 | 运行时**写入探测** + 三级降级（IDB→localStorage→内存）+ 非持久横幅（§4.5、§6.1） |
| 4 | `showSaveFilePicker` 在 iOS Safari 不存在（File System Access 为 Chromium 专属） | 中 | 特性探测：iOS 一律 `<a download>` Blob → 存入"文件"App（§5.6） |
| 5 | "用 100dvh"：dvh 仅 iOS ≥15.4 | 中 | 级联回退 `100vh → 100dvh` + JS `--app-height` 兜底（§6.1） |
| 6 | Tailwind 未锁版本：v4 默认 oklch 颜色 iOS <15.4 无法解析，整站样式失效 | 中 | 锁定 **Tailwind v3.4**（§4.1） |
| 7 | 图表库二义（Recharts 或 Chart.js） | 低 | 定 **Chart.js v4**：体积更小、canvas 触控性能好、路由级懒加载（§4.1） |
| 8 | 部署"最终方案你定" | 低 | 定 **Cloudflare Pages** 主选（免备案、国内可达性优于 Vercel），Vercel 备选（§4.1） |
| 9 | Bill 缺 `ledgerId` / `deletedAt` | 中 | 起始即预留，避免多账本/30 天恢复功能上线时做数据迁移（§4.3） |
| 10 | 无 schema 演进机制 | 中 | `meta` store 存 `schemaVersion` + 迁移 runner，启动时自动升级（§4.5） |
| 11 | 明细页"下拉刷新"：纯本地数据无服务器可刷，且与 Safari 橡皮筋手势冲突 | 低 | 改为回前台（`visibilitychange`）自动重算 + 同步状态芯片（§5.2） |
| 12 | 删除/覆盖等破坏性操作未定义确认方式；`window.confirm` 在独立模式体验差且可能被拦截 | 中 | 统一自绘底部确认 Sheet（§5.0） |
| 13 | CSV 仅提 BOM | 低 | 明确 BOM(`\ufeff`) + CRLF 行尾 + 固定列序，Excel/WPS 中文不乱码（§5.6） |
| 14 | 云备份明文上传财务数据 | 中 | 可选 **AES-GCM 加密**（PBKDF2 派生密钥，口令仅存本地）（§4.6） |
| 15 | 无性能预算、无 SW 更新流程 | 中 | 首屏 ≤250KB(gzip)、LCP<2s；SW 更新检测 + "点击刷新"提示（§6.2、§4.7） |
| 16 | `crypto.randomUUID`/`structuredClone` 等仅 iOS ≥15.4 | 低 | `src/utils/compat.ts` 统一提供 <15.4 回退（§4.4） |

## 2. 角色与协作约定

- 角色：你是一位独立、严谨的高级全栈工程师（兼产品视角），按"可演示 → 可验收 → 可迭代"节奏交付；先讲思路再给代码；关键路径 TypeScript strict + 类型保护。
- 每阶段交付三段式：① 做了什么 + 关键文件路径；② 手动验证步骤（具体到点击顺序）；③ TODO / 已知问题。
- 任何第三方依赖引入前说明用途与 gzip 体积影响；优先浏览器原生能力。
- 每阶段代码必须完整可跑，禁止一次性甩出跨阶段的大块代码。

## 3. 产品范围与不变量

### 3.1 定位
自用、轻量、无广告、无会员、可导出、可云端备份的极简记账 PWA。

### 3.2 功能分级
- **P0**：记一笔、明细（增删改查/月切换/搜索）、图表（周/月/年）、导出 CSV/JSON + 导入、云备份（可关/可换源）、极简 UI（截图核心交互）。
- **P1**：预算环、多账本、隐藏金额、分类/账户管理、PWA 安装引导、30 天回收站。
- **P2（可选）**：标签、多币种、周期记账、资产管家、桌面小组件说明页。

### 3.3 移除项（对照截图）
VIP/会员、签到打卡、消息、徽章积分、邀请好友、家庭账单、广告及"去除广告"、App Store 评分、发现页营销入口（省钱优惠券/发票助手/房贷计算器/汇率换算器）。

### 3.4 不变量红线【硬】
- [ ] 无任何付费墙；导出/备份/导入全部免费可用。
- [ ] 密钥/口令不硬编码、不上传、不入仓库；仅存本机 IndexedDB。
- [ ] 运行时无外部网络依赖（无 CDN 字体/图标/统计），离线全功能（同步除外）。
- [ ] 不引入 antd-mobile / vant 等重组件库；纯 Tailwind + 自绘组件。
- [ ] 不使用需备案的服务/域名。

## 4. 技术架构

### 4.1 技术栈（定版）【默认】

| 层 | 选型 | 版本 | 理由 / 体积 |
|---|---|---|---|
| 构建 | Vite + React + TS(strict) | ^5 / 18 / 5 | `build.target='es2020'`（iOS15 兼容线） |
| 样式 | TailwindCSS + CSS Variables | **3.4** | v4 的 oklch 不兼容 iOS<15.4（审查#6） |
| 路由 | React Router | ^6 | 5 主 Tab + 设置子页 |
| 状态 | Zustand | ^4 | 无模板代码；persist 仅存设置类轻量项 |
| 存储 | idb 封装 repository | ^8 | ~1KB；事务安全、索引查询 |
| 图表 | Chart.js | ^4 | 懒加载 ~70KB gz；canvas 触控友好 |
| 图标 | lucide-react | latest | 纯 SVG、tree-shaking |
| PWA | vite-plugin-pwa | latest | Workbox generateSW |
| 部署 | Cloudflare Pages | — | 免备案、HTTPS、CDN；Vercel 备选 |

首屏依赖总预算 ≤250KB gzip（§6.2）。

### 4.2 工程配置【硬】
- `tsconfig`：`strict: true`、`noUncheckedIndexedAccess`。
- Vite dev 默认 `server.host: true`（局域网真机调试）。
- ESLint + Prettier 默认开启（可关，需说明）。
- 目录约定：

```
src/
  components/   # TabBar、Header、Sheet、Toast、NumberKeyboard、EmptyState、ErrorBoundary、SyncChip
  pages/        # Detail / Chart / Discover / Mine / Settings/* 
  features/entry/  # 记一笔面板（全局挂载）
  db/           # idb 封装、schema、migrations、repository（bills/categories/...）
  sync/         # SyncAdapter 接口、gist/webdav/r2 实现、crypto.ts
  store/        # zustand slices（bills、settings、sync、ui）
  utils/        # money.ts、date.ts、compat.ts、csv.ts、download.ts
  deploy/       # relay-worker.ts（WebDAV CORS 中继，可选部署）
```

### 4.3 数据模型【硬】

```ts
/** 金额一律整数分；展示层 toYuan(cents) 格式化为 2 位小数 */
type Bill = {
  id: string;               // uuid：crypto.randomUUID，<15.4 回退 getRandomValues
  ledgerId: string;         // 所属账本（起始预留，审查#9）
  type: 'expense' | 'income';
  amountCents: number;      // 正整数分
  categoryId: string;
  tagIds: string[];         // 默认 []
  note: string;             // 默认 ''
  accountId?: string;
  occurredAt: number;       // 毫秒（用户可选日期，默认当前时刻）
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;       // 软删除；>30 天物理清理（支撑"数据恢复"）
};
type Category = { id: string; name: string; icon: string; type: 'expense'|'income'; color?: string; sort: number; builtin: boolean; hidden?: boolean };
type Account  = { id: string; name: string; type: 'cash'|'card'|'ewallet'; icon: string; sort: number; initialCents?: number };
type Tag      = { id: string; name: string; color?: string };
type Budget   = { yearMonth: string; amountCents: number };        // "2026-08"
type Ledger   = { id: string; name: string; builtin: boolean };
type Meta     = { key: string; value: unknown };                  // schemaVersion / lastSyncAt / settings...
```

- 账户余额 = `initialCents + Σ收入 − Σ支出`（按 accountId 聚合），不冗余存储。
- 内置分类种子对照截图 S8：餐饮/购物/日用/交通/蔬菜/水果/零食/运动/娱乐/通讯/服饰/美容/住房/居家/孩子/长辈/社交/旅行/烟酒/数码/汽车/医疗/书籍/学习/宠物/礼金/礼物/办公/维修/捐赠/彩票/亲友（支出）；工资/奖金/理财/红包/其他（收入）。内置不可删，可改名/排序/隐藏。

### 4.4 金额与日期约定【硬】
- `money.ts`：`addCents/subCents` 纯整数运算；`toYuan(cents)` 用 `(cents/100).toFixed(2)` 仅在最外层；输入解析 `parseYuanToCents("12.3")→1230`，拒绝非法串。
- 周起始 = **周一**；周标签 = ISO 周序号（对照 S2 "30周/31周/本周"）。
- 月 key = `YYYY-MM`；"每月开始于"默认 1 日（P2 可配置）。
- 时区 = 设备本地；所有分组/汇总按本地日期键 `YYYY-MM-DD`。
- `compat.ts`：`uuid()`、`safeStructuredClone()`（回退 JSON）、`supportsDvh()` 等集中回退。

### 4.5 存储层与降级【硬】
- IDB 库 `shark-ledger`，stores：`bills`（索引 `byDay(ledgerId+dayKey)`、`byUpdated`）、`categories`、`accounts`、`tags`、`ledgers`、`budgets`、`meta`。
- 迁移 runner：启动读 `meta.schemaVersion`，按 `migrations[1→N]` 顺序事务升级；任何版本的数据导入后同样先过迁移。
- **能力探测**（启动时，先于渲染）：打开测试库 → 写/读/删一条记录 → 判定三级：

| 探测结果 | 策略 | 用户可见 |
|---|---|---|
| IDB 可写且持久 | 正常模式 | 无 |
| IDB 不可用（私密模式/老旧内核） | 降 localStorage 单 key 序列化（≤5MB，超配额 toast 告警并引导导出） | 顶部黄色横幅："当前浏览器隐私模式，数据可能不会持久保存，请及时导出" |
| 二者皆不可用 | 内存模式 | 红色横幅 + 仅导出可用 |

- 多标签页：`storage`/`broadcastchannel` 监听变更并重算 store（防双开错乱）。

### 4.6 云备份架构【硬】

```ts
interface SyncAdapter {
  kind: 'gist' | 'webdav' | 'r2';
  test(conn): Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  push(conn, file: BackupFile): Promise<void>;
  pull(conn): Promise<BackupFile | null>;   // null = 云端无备份
}
type BackupFile =
  | { v: 1; enc: false; meta: BackupMeta; data: FullDump }
  | { v: 1; enc: true; kdf: 'PBKDF2-SHA256'; iter: 600000; salt: string; iv: string; ct: string }; // AES-256-GCM
```

- **默认源 GitHub Gist**：`api.github.com` CORS 友好；用户填 Personal Access Token（scope 仅 `gist`）+ 可选 gistId；单文件 `shark-ledger-backup.json`（≤10MB 上限，超出提示精简）。
- **WebDAV（含坚果云）**：必须经 `deploy/relay-worker.ts`（Cloudflare Worker，~40 行：透传 METHOD/headers/body，Worker 侧无 CORS 限制；用户自部署，URL 填入设置）。文档附部署步骤。
- **R2**：桶 CORS 配置 `*` + 用户自有 SigV4 凭证（Web Crypto 签名，不引 AWS SDK）；标【可选】。
- 触发：写操作后 **5s 防抖**自动 push；`visibilitychange=hidden` / `pagehide` 立即尝试；设置页"立即同步"。
- 状态芯片（明细页 Header 右侧小圆点）：绿"已同步 刚刚/X 分钟前"／红"同步失败（点击查看原因）"／灰"未开启"。
- 恢复："从云端恢复"先 `test+pull` → 展示云端 `exportedAt` 与本地笔数对比 → 用户选 **覆盖 / 合并**；合并规则 = 按 id 并集、同 id 取 `updatedAt` 大者。
- 加密开关开启时设口令（二次输入确认）；口令仅存本机；恢复时口令错 → 明确报错"口令错误"，不静默失败。
- 凭证仅存 IDB `meta`，mask 显示；"清除本机凭证"按钮。

### 4.7 PWA 架构【硬】
- `manifest.webmanifest`：`name=鲨鱼记账`、`display=standalone`、`theme_color=#F5C518`、`background_color=#FFFFFF`、icons 192/512（含 maskable）。
- iOS 专属 head：`apple-mobile-web-app-capable=yes`、`status-bar-style=black-translucent`、`apple-touch-icon`（180×180，否则主屏图标为截图缩略）。
- SW 策略：构建产物 **cache-first**；导航 **network-first → cache 兜底**（保证离线开壳）；无跨域缓存项。
- 更新：检测到 waiting → 底部 toast"检测到新版本，点击更新"→ `skipWaiting` + reload；禁止静默强刷打断记账。
- 安装引导：检测 iOS 且 `!navigator.standalone` → 首次进入"我的"弹引导 Sheet（分享→添加到主屏幕 图文）；"我的"保留常驻入口。

## 5. 页面与功能规格（含验收标准）

### 5.0 全局交互与状态规范【硬】
- **TabBar**：5 入口（明细/图表/＋/发现/我的），中间 ＋ 为凸起 56px 圆钮（对照 S1）；`position:fixed; bottom:0` + `padding-bottom: calc(env(safe-area-inset-bottom) + 8px)`；`-webkit-tap-highlight-color: transparent`；触控目标 ≥44px。
- **Header**：`#F5C518` 暖黄 + `padding-top: calc(env(safe-area-inset-top) + 8px)`；黑色大数字月份。
- **主题**：CSS Variables（`--primary:#F5C518` 等），设置页可换主题色（P1）；`color-scheme: light` 锁定，避免 iOS 表单暗色错乱。
- **Toast**：底部居中、2.5s 自动消、不阻塞交互；成功/失败/警告三态。
- **确认 Sheet**：所有破坏性操作（删除/覆盖导入/覆盖恢复/清凭证）用自绘底部 Sheet，含"取消"（默认焦点）与红色确认；**禁用 window.confirm**。
- **加载**：首帧 hydration 用骨架屏（明细列表 3 行灰条）；按钮级异步操作 spinner + 禁用防双提交。
- **空状态**：内联 SVG 插画 + 文案 + CTA。明细："开始记第一笔吧"＋记账按钮；图表："本周还没有记录"；搜索无结果："没有找到相关账单"。
- **ErrorBoundary**：路由级兜底卡片"页面出错了"+ 重载按钮；全局 `unhandledrejection` 记入本地环形日志（IDB `meta`，≤200 条）。

### 5.1 记一笔（入口面板）
交互【硬】：TabBar ＋ 或任意"记账"CTA → 底部 Sheet 上滑（≤300ms）；顶部 支出/收入 切换（默认取设置"默认记账类型"）；分类网格 4 列（对照 S8，记住每类最后选择）；自绘数字键盘 `inputmode` 无关（自绘键不弹系统键盘）；金额实时格式化（最多 7 位整数 2 位小数，第二个小数点忽略）；备注单行 ≤50 字；日期默认今天，可改任意过去/未来；账户可选（默认"现金"）。
状态：金额=0 时保存键置灰；IDB 写失败 → toast 报错并保留面板内容。
验收：
- [ ] AC-E1 保存→toast"已记一笔"→面板收起→明细页对应日期组立即出现，全链路 ≤200ms。
- [ ] AC-E2 飞行模式下完整可用。
- [ ] AC-E3 编辑态复用面板、原值回填、保存更新 `updatedAt` 且同步触发防抖备份。
- [ ] AC-E4 键盘连点、粘贴非法串不崩溃不入库。

### 5.2 明细页
交互【硬】：顶部 月切换（"08月 ▼" 弹月份滚轮，跨年月）+ 本月收入/支出汇总 + 眼睛隐藏金额（设置持久化，对照 S1 右上）；按日分组"08月25日 星期二"，组头右侧"收入：X 支出：Y"；列表项 = 分类图标 + 标题(+备注灰字) + 右侧金额（支出 `-`、收入 `+`；默认深灰，设置可开"红绿配色"）；**点按=编辑**、**长按=删除确认 Sheet**；右上搜索图标 → 搜索页（备注/分类名子串、金额前缀匹配，实时过滤）；回前台自动重算（不做了无意义的下拉刷新，审查#11）。
状态：空月 → 空状态；搜索无结果 → 提示。
验收：
- [ ] AC-L1 月切换后汇总与分组即时正确（含跨年月、2 月边界）。
- [ ] AC-L2 隐藏金额时所有金额位显示 `****`（含汇总/图表/发现页联动）。
- [ ] AC-L3 删除后列表即时移除，30 天内可在 设置→数据恢复 找回。
- [ ] AC-L4 1000 笔数据下滚动无卡顿（列表按日分组虚拟化或分页，每页 50）。

### 5.3 图表页
交互【硬】：顶部 支出/收入 切换 + 周/月/年 Tab + 横向周期滑动条（"30周…上周/本周"，对照 S2）；折线图 = 当前口径趋势 + 虚线平均线 + 顶部"总支出/平均值"；下方排行榜 = 分类占比% + 金额 + 黄色进度条，降序，Top10。
周=周一始；月=1..31 日；年=1..12 月。Chart.js 路由懒加载；触屏 tooltip 显示单日金额。
验收：
- [ ] AC-C1 三粒度数值与明细页手工加总一致（分单位精确，无浮点误差）。
- [ ] AC-C2 空数据周期显示空状态而非空白/报错。
- [ ] AC-C3 切换粒度/周期无内存泄漏（chart 实例 destroy）。

### 5.4 发现页
交互：账单卡（月收入/支出/结余，结余负数红色，对照 S3）；预算卡 = 环形进度（未设置 → CTA"设置预算"；超支 → 环红 + "已超支"，对照 S3）；预算编辑 Sheet（月预算金额）；资产管家/常用功能区 = 移除或 P2 占位。
验收：
- [ ] AC-B1 预算环百分比 = 已用/预算，超支态正确；改预算即时生效。

### 5.5 我的 & 设置
我的：头像昵称（本地可改）、记账总天数/总笔数、安装引导入口、设置入口、关于（版本）。移除 VIP/打卡/消息/邀请（§3.3）。
设置分组：
- 功能：分类设置（增/改名/排序/隐藏，内置不可删）、收支账户（增/改/排序）、默认记账类型、每月开始于（P2）。
- 数据安全：导出数据、导入数据、解锁密码（P2）、隐藏总金额开关、**数据恢复（30 天回收站列表，单条/全部恢复）**、云备份配置入口。
- 系统：清除缓存（清 SW 缓存并提示）、关于。
验收：
- [ ] AC-S1 分类被隐藏后记账面板不显示、历史账单仍正确归类展示。
- [ ] AC-S2 删除分类前有引用检查：被账单引用 → 禁止删除并提示改用"隐藏"。

### 5.6 导出 / 导入【硬】
- CSV：列序 `日期,类型,分类,金额(元),账户,标签,备注`；BOM `\ufeff` + CRLF；金额 2 位小数；命名 `ledger-YYYY-MM-DD.csv`。
- JSON 全量：`{meta:{schemaVersion,exportedAt,appVersion},data:{bills,categories,accounts,tags,ledgers,budgets,settings}}`；命名 `ledger-backup-YYYY-MM-DD.json`。
- 下载：特性探测 `showSaveFilePicker`（仅桌面 Chromium）→ 否则 `<a download>` Blob（iOS 入"文件"App）。
- 导入：仅 JSON；校验 schema（逐表类型保护，列出错误条数）→ Sheet 选 **覆盖/合并**（规则同 §4.6）→ 导入后跑迁移 runner → toast 结果。
验收：
- [ ] AC-X1 CSV 在 Excel/WPS/Numbers 打开中文不乱码、列对齐、金额可求和。
- [ ] AC-X2 导出→清空→导入，数据逐字段一致（自动化 diff 脚本 `scripts/verify-roundtrip.ts`）。
- [ ] AC-X3 损坏/异构 JSON 导入：明确报错原因，本地数据不受影响。

### 5.7 云备份设置页
字段按适配器动态表单：Gist=Token(+gistId)；WebDAV=URL/用户名/应用密码；R2=endpoint/AK/SK/bucket。密码 mask + 可见切换。按钮：测试连接（显示延迟或失败原因）、立即同步、从云端恢复、开启自动同步开关、加密开关+口令设置。
验收：
- [ ] AC-Y1 测试连接失败时给出可操作原因（CORS/401/404/网络）。
- [ ] AC-Y2 开启自动同步后，记一笔 → 5s 内状态芯片变"同步中"→"已同步"。
- [ ] AC-Y3 杀进程重开（清本地缓存模拟换机）→ 从云端恢复 → 数据完整。
- [ ] AC-Y4 加密备份在错误口令下报"口令错误"，正确口令完整还原。

### 5.8 PWA 与离线【硬】
验收：
- [ ] AC-P1 iOS Safari 分享→添加到主屏幕：图标正确（apple-touch-icon）、启动无地址栏、状态栏融合。
- [ ] AC-P2 飞行模式冷启动独立 App：外壳 + 全部本地数据可用；同步芯片显示离线灰态。
- [ ] AC-P3 发新版后再次打开出现"点击更新"提示，更新后数据不丢。

## 6. 移动端适配与非功能硬指标

### 6.1 iOS Safari 适配清单【硬】
- [ ] viewport：`width=device-width, initial-scale=1, viewport-fit=cover`。
- [ ] 高度：`height:100vh; height:100dvh;` 级联 + JS 写 `--app-height`（<15.4 兜底），主布局用变量。
- [ ] 安全区：TabBar/Header 按 §5.0；横屏不要求。
- [ ] 系统数字输入（如预算/搜索金额）用 `inputmode="decimal"`。
- [ ] `-webkit-touch-callout:none`（长按删除场景防系统菜单）；`user-select:none` 仅限交互控件。
- [ ] `overscroll-behavior-y:contain`（iOS16+ 渐进增强，低版本不报错）。
- [ ] 橡皮筋/双击缩放不破坏布局；`touch-action:manipulation` 消除 300ms 与双击缩放。
- [ ] 私密模式三级降级与横幅（§4.5）。
- [ ] 独立模式检测 `navigator.standalone` 用于安装引导与状态栏样式。
- [ ] 桌面 Chrome/Android 不崩：≥768px 居中 480px 容器 + 灰底。

### 6.2 性能预算【硬】
- 首屏 JS+CSS ≤250KB gzip（Chart.js 懒加载不计入）；图标全 SVG 内联，无外部字体/图片。
- 4G 冷开 LCP < 2s；记账到列表 ≤200ms；Tab 切换 ≤100ms（无感知）。
- Lighthouse（Moto G4 模拟）Performance ≥85、PWA 项全过。
- 列表/图表在 3000 笔数据下交互流畅（分组分页 + 汇总增量缓存）。

### 6.3 安全与隐私【硬】
- 无统计、无埋点、无外链；CSP 默认 `default-src 'self'`（同步域名按需白名单）。
- 凭证/口令仅本机；备份加密默认建议开启；Token 权限最小化文档提示（gist scope）。
- 依赖审计：`npm audit` 无 high/critical 才交付。

### 6.4 可访问性
- 正文对比度 ≥4.5:1（黄底黑字满足）；触控目标 ≥44px；焦点态可见（键盘用户）。

## 7. 交付节奏 M1–M7【硬】

| 阶段 | 范围 | 验收（DoD） | 验证方式 |
|---|---|---|---|
| M1 | 脚手架 + 5 空页 + TabBar/Header + 安全区 + 主题变量 | `npm run dev` 真机可开；无横向滚动；TabBar 切换正常 | iPhone 同 Wi-Fi 访问 `--host` 地址 |
| M2 | IDB schema + 迁移 runner + 种子分类/账户 + repository + 能力探测降级 | 种子账单写入刷新仍在；私密模式出横幅并降级 | 真机 + 私密窗口双验 |
| M3 | 记一笔 + 明细 CRUD + 搜索 + 隐藏金额 + 回收站 | AC-E1~E4、AC-L1~L4、AC-S1~S2 | 按 §5.1/5.2 逐条 |
| M4 | 图表页 | AC-C1~C3 | 与明细手工对账 |
| M5 | 导出/导入 + CSV/JSON 规范 | AC-X1~X3 | Excel 实开 + roundtrip 脚本 |
| M6 | 云备份（Gist 默认 + WebDAV 中继脚本）+ PWA + 部署 CF Pages | AC-Y1~Y4、AC-P1~P3 | 真机飞行模式 + 清缓存恢复演练 |
| M7 | 预算、多账本、设置完善、性能达标、UI 打磨 | AC-B1 + §6 全清单 | Lighthouse + 3000 笔压测 |

每阶段结束按 §2 三段式汇报；任何阶段验收未过不进入下一阶段。真机 PWA/SW 验证需 HTTPS：用 `cloudflared tunnel --url http://localhost:4173` 或 CF Pages 预览域。

## 8. 最终验收清单

- [ ] iPhone 13 Pro Max Safari 扫码/分享打开，4G 加载 <2s。
- [ ] 记账→明细 ≤200ms；离线全功能可用。
- [ ] CSV/JSON 导出导入 roundtrip 零差异；Excel 中文不乱码。
- [ ] 云备份开启后，清本地重开可完整恢复；加密口令错误有明确报错。
- [ ] PWA 安装、离线、更新三件套通过。
- [ ] 无广告/会员/外链；无密钥入仓库；`npm audit` 干净。
- [ ] 私密模式降级横幅出现且数据不静默丢失。
- [ ] 3000 笔数据下明细/图表流畅；Lighthouse Performance ≥85。

## 附录 A：截图映射

S1 明细页（月汇总/日分组/TabBar/隐藏眼睛）→ §5.2；S2 图表页（周粒度/平均线/排行榜）→ §5.3；S3 发现页（账单卡/预算超支环）→ §5.4；S4 我的页（统计/设置入口，VIP 区移除）→ §5.5；S5–S7 设置页（分组/数据安全/快捷使用，取数据安全子集）→ §5.5；S8 记账分类面板（4 列网格/支出收入 Tab）→ §5.1。

## 附录 B：关键兼容事实速查

- `100dvh`/`crypto.randomUUID`/oklch：Safari 15.4+ → 需回退（#5/#16/#6）。
- `a[download]`：iOS 13+；`showSaveFilePicker`：Safari 无（#4）。
- Service Worker / manifest：iOS 11.3+；Web Push 不用（16.4 才支持，超范围）。
- 坚果云 WebDAV 无 CORS 头 → 浏览器直连不可行，必须中继（#1）。
- GitHub API（api.github.com）支持 CORS 含鉴权请求 → Gist 备份可行。
- iOS 私密模式存储可能非持久 → 运行时写入探测为准（#3）。
