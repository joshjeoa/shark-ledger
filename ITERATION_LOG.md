# 🦈 鲨鱼记账 · 迭代日志 (Iteration Log)

> 本文档记录项目每次代码修改、功能新增与 Bug 修复。新条目追加在最上方。

---

## [v1.8.0 - 2026-08-30] - 鲨鱼 Pro（VIP）第一期：权益层 + 兑换码 + 无限账本 + 年度报告 + 照片云同步

### 📝 更新详情
- 📋 **方案文档 (Docs):**
  - 新增 `docs/VIP功能方案.md`：免费/Pro 功能划分、权益与兑换架构（完整可重复执行 SQL）、分期路线图（P1 权益层/账本/年报 ✅、P2 照片云 ✅、P3 AI ⏸ 待定、P4 主题包 未开工）、验收标准与诚实的风险清单（公开仓库客户端锁只做温和门槛，真壁垒放在依赖服务器的功能上）
- ✨ **新增 (Added):**
  - **Pro 权益层**（`src/vip/entitlement.ts`，懒加载不进主包）：判定顺序 = 未配置账号体系（自部署）视为 Pro → localStorage `shark-pro-override=1` 测试开关 → 登录后以云端 `pro_entitlements` 为准（expires_at null = 永久）；`redeemCode` 调 SECURITY DEFINER RPC `redeem_license`（码池表 `licenses` 客户端零权限）；登录/登出事件自动刷新权益
  - **ProGate 组件**（`src/vip/ProGate.tsx`）：`ProGateButton` 免费点击弹升级面板（卖点清单 + 兑换码输入 + 登录引导），Pro 直接放行；设置页新增「鲨鱼 Pro」入口 → `/settings/pro`（权益状态卡 + 权益清单 + 兑换/续费表单）
  - **无限账本**：免费上限 2 个，只拦截新建（存量超限不受影响，改名/删除/切换不受限）；拦截时弹升级面板
  - **年度报告 `/report`**（懒加载，图表页头部「年报」入口）：全年总支出/收入/结余/日均、记账笔数与天数、最常花钱分类、花得最多的月份、最大单笔、同比去年、12 个月收支柱状图（纯 CSS，不引 chart.js）；**Canvas 生成 1080×1440 分享卡片**（固定暗色金融风 + 金色渐变头部 + 月度柱状图 + 水印），一键保存 PNG；年份切换限制在「最早账单年 ~ 当前年」；隐藏金额模式下卡片金额同步打码
  - **照片云同步**（Pro，`src/vip/photoCloud.ts` 懒加载）：本地 IndexedDB ↔ Supabase Storage 私有桶（`photos/<uid>/<photoId>`，RLS 仅本人可读写）；上传前列目录去重（幂等，重复点不重复耗流量）；下载只回落仍被本地账单引用的照片；账号页新增「照片云同步」卡（本机/云端/待上传三格统计、上传/下载按钮带进度、自动上传开关 `settings.photoCloudAuto`）；保险库同步成功后防抖 8s 自动增量上传（App 全局监听 `vault-synced`）
  - `repo.allPhotos()` / `repo.importCloudPhoto()`：照片批量读取与云端按 id 回落；`download.ts` 拆出可复用的 `downloadBlob`
- 🐛 **修复 (Fixed):** 无（本期为纯功能迭代）
- ✅ **验证 (Verified):**
  - `tsc --noEmit` strict + 构建通过（主包 96.6KB / gzip 32.2KB；ProPage/ReportPage/photoCloud 均为懒加载独立分块，不用 Pro 功能的用户几乎零体积成本）
  - 浏览器端到端（Vite dev + 390×844，365 笔演示数据）：免费态点「年报」/ 新建第 3 个账本 → 均正确弹升级面板；未登录兑换码 → 明确提示先登录；Pro 页状态卡/权益清单/兑换表单渲染正确；`shark-pro-override` 开关打开后第 3 个账本创建成功、年报页完整渲染（12 根月度柱、足迹、生成卡片 toast「卡片已生成」）；登录态下照片云同步卡可见（未登录态正确隐藏）；明细/账号页回归正常
- 📌 **说明 (Notes):**
  - **需要在 Supabase SQL Editor 执行 `docs/VIP功能方案.md` §2.1 的 SQL 后**，兑换码与照片云同步才真正生效（应用内相应操作会给出明确报错提示）；测试码 `SHARK-TEST-2026` / `SHARK-TEST-LIFETIME` 随 SQL 附带，正式运营前删除
  - 照片上传为明文（已压缩）原图，不含账单金额，依赖 Storage 桶 RLS 按用户隔离；AI 分析（P3）等确定 API 成本后再开工

### 🎯 待办与下一步 (TODO)
- [ ] 线上端到端验证照片云同步（执行 SQL 建桶 + 兑换测试码）
- [ ] AI 月度分析 / 拍小票记账（P3）：确定 API 服务商与定价后开工
- [ ] Storage 用量显示与配额提示（照片数量接近免费档 1GB 时提醒）
- [ ] 账号通道用户侧收尾：设置数据口令 + 再次同步使云端密文化
- [ ] **自动同步仍是单向整文件覆盖（Gist/WebDAV 通道）**

---


## [v1.7.0 - 2026-08-30] - 图表升级：构成环形图 / 对比分析 / 收支柱状图 + 浮层误触与图标裁切修复

### 📝 更新详情
- ✨ **新增 (Added):**
  - **构成分析环形图**：跟随 支出/收入 + 周/月/年 + 周期偏移，前 8 类各占一色、其余并入「其他」，圆心绘制总额（chart.js 内联 plugin afterDraw）；图例含百分比与金额；**点击分片/图例 → 排行榜对应分类滚动到可见并高亮**（其余行降透明度，再次点击取消，切换周期自动复位）——图表与分析列表首次联动
  - **对比分析卡（本期 vs 上期）**：等长窗口环比（本周vs上周/本月vs上月/今年vs去年随周期切换），收入/支出/结余三行，涨跌着色遵循语义（支出涨红跌绿、收入涨绿跌红），上期为零或结余转负显示「上期无对比」不算误导性百分比
  - **近 6 个月收支对比柱状图**：收入（绿）/支出（金）分组圆角柱，始终以当前月收尾（独立于周期偏移），空数据显示空状态
  - **图表卡片化**（v1.6.0 待办落地）：趋势/构成/对比/柱状图/排行榜全部收进 `rounded-2xl` 卡片（自动获得 v1.6.0 的卡片描边+景深）
  - **隐藏金额模式贯穿所有新图表**：tooltip、圆心总额、图例金额、y 轴刻度同步打码
- 🐛 **修复 (Fixed):**
  - **记一笔浮层误触**（键盘误触三件套）：
    1. **入场冷却 300ms**：面板滑入期间 `pointer-events: none` + 遮罩点击忽略——加号在屏幕正中、面板打开后其正下方恰是键盘"0"键，双击加号的第二击会砸进键盘误输入数字，或砸中遮罩秒开秒关；冷却期内一概不响应
    2. **退场屏蔽 280ms**：关闭后短暂挂一层透明拦截，余触不再穿透到底下的 FAB/账单行（点遮罩关闭的习惯性连点不再误开编辑）
    3. **保存防双击**：`savingRef` 互斥——保存是异步落库，落库期间连点「记一笔」不会重复入账
    - 另：保存按钮与键盘之间加 10px 间距 + 按钮增高到 44px——瞄准键盘顶行（1/2/3）时不再擦到正上方的「记一笔」误存账
  - **FAB/图标渲染不完整（上半截偶发缺失）**：
    1. **记一笔 FAB 移出磨砂玻璃容器**（改为 nav 兄弟节点 + 绝对定位）：`backdrop-filter` 容器会把带 transform 的合成子元素裁进自己的圆角盒——上探出栏体的 FAB 上半截/加号图标偶发缺失的根源，无 `overflow-hidden` 也裁（v1.6.0 只移除了 overflow-hidden 不够）
    2. **Sheet 面板光栅化加固**：入场动画期间提升独立合成层（`will-change: transform`，整层一次性光栅化），动画结束即摘除 `sheet-up` 动画类强制静止态整层重绘——修复 WebKit 对「transform 动画 + 圆角 + overflow 滚动容器」逐瓦片重光栅化造成的面板内图标上半截缺失
- ♻️ **优化 (Changed):**
  - Sheet 面板 `overscroll-behavior: contain`：面板内滚动到头不再把滚动手势链给底层页面
- ✅ **验证 (Verified):**
  - `tsc --noEmit` strict + 构建通过（主包 95.5KB / gzip 31.8KB；ChartPage 懒加载块 12.9KB，chart.js 仍按需加载不进首装预缓存）
  - 浏览器端到端（Vite dev + 390×844 视口，369 笔数据）：折线/环形（圆心总额+图例+分片点击联动排行榜高亮 opacity 0.35、再点取消）/对比卡（收入 +3119%、支出 +2%、结余上期为负显示「上期无对比」）/近 6 月柱状图全部渲染（canvas 像素级确认非空白）
  - 浮层机制逐项确认：入场冷却期面板 `pointer-events: none` → 冷却后恢复 `auto`；`sheet-up` 动画类在动画结束后自动摘除、`will-change` 随之降级；退场屏蔽层关闭后出现、280ms 自动卸载；FAB 为 nav 直接子元素、不在 `backdrop-filter` 容器内、完整渲染无裁切
  - 明细页回归：账单行「备注（账户名）」、按日分组小计、TabBar/FAB 正常
- 📌 **说明 (Notes):**
  - 测试中 Playwright locator 点击偶发超时为本环境命中检测怪癖（坐标/DOM 派发点击一切正常），非应用问题

### 🎯 待办与下一步 (TODO)
- [ ] 账号通道用户侧收尾：设置数据口令 + 再次同步使云端密文化
- [ ] **自动同步仍是单向整文件覆盖（Gist/WebDAV 通道）**：账号通道已用合并策略解决
- [ ] bills 的 `byUpdated` 索引确认用或删；`FullDump` 不含 settings（规格 §5.6）
- [ ] README Roadmap：标签系统、多币种、周期记账、资产管家

---


## [v1.6.1 - 2026-08-29] - 账单行显示支付账户 + 键盘弹出页面不上移

### 📝 更新详情
- ✨ **新增 (Added):**
  - **账单行第二行显示支付账户**：备注为重点标注（次级文字加深一档 `text-ink-2`），账户名用括号弱化跟在后面（如「便利店咖啡（支付宝）」）；无备注时直接显示账户名，两者都为空不显示第二行。明细页新增账户 id→对象 Map 索引
- 🐛 **修复 (Fixed):**
  - **iOS 键盘弹出时整个页面上移**：`setupAppHeight` 此前无条件跟随 `window.innerHeight`，键盘弹出视口骤缩 → 布局压缩上移。现视口高度骤降（>12%）视为键盘弹出、布局高度锁定不动（键盘悬浮覆盖，与原生 App 一致）；工具栏收起等小幅变化正常跟随。另在聚焦/失焦/视口变化时把窗口滚动锁回原位，阻止 iOS 把 fixed 头部一起顶出屏幕
- 📌 **已知限制 (Notes):**
  - **iOS 主屏 PWA 弹出原生键盘而非微信输入法**：这是系统级限制——第三方键盘在主屏 WebApp 中的可用性由 iOS 决定，网页无法指定弹出的输入法。缓解：在 PWA 里点键盘左下角地球键切到微信输入法（iOS 通常会记住）；若当前 iOS 版本在 standalone 模式下不加载第三方键盘，只能用 Safari 打开网页版使用
- ✅ **验证 (Verified):**
  - 明细列表 120 行渲染「备注（账户名）」格式正确（如「便利店咖啡（支付宝）」「晚饭（微信）」）
  - `tsc --noEmit` strict + 构建通过

---

## [v1.6.0 - 2026-08-29] - UI 换装：暗色金融风（深炭 + 香槟金）

### 📝 更新详情
- 🎨 **视觉 (Changed):**
  - **配色体系整体重写**：暗色 = 蓝黑炭阶（#0B0E13 底 / #151A23 卡片 / 发丝分隔线 rgba 白 8%）+ 香槟金点缀（#E4C066）；浅色 = 暖象牙纸感（#F7F5F0 底）+ 深鎏金（#A8801F）。金色系按钮明暗两种模式统一配深色文字（--on-primary），保证可读性
  - **质感层**：全局 `font-variant-numeric: tabular-nums`（金额数字等宽对齐）；`.rounded-2xl.bg-card` 统一悬浮阴影 + 发丝描边（暗色靠描边分层，阴影收敛）
  - **TabBar 悬浮玻璃栏**：脱离屏幕边缘（两侧 12px + 底部安全区）、磨砂（backdrop-blur 24px + 88% 卡片玻璃底）、圆角 16px + 景深；记一笔 FAB 上浮呼应；四个主页面底部留白 pb-24 → pb-28 适配
  - **主题色预设换血**：iOS 系统色 → 金/铂/玉/玫瑰/雾蓝五个低饱和点缀色；settings persist 版本 1→2，历次换肤的旧默认色（#F5C518、#007AFF）静默迁移到香槟金，用户自选色保留
  - 状态栏（theme-color meta）与 PWA manifest 配色同步：深炭 #0B0E13 / 暖纸 #F7F5F0
- 📌 **说明 (Notes):**
  - 全部改动走语义 token，组件层仅 TabBar 结构调整，明暗/auto 三种外观均可用；图表取色自 CSS 变量自动跟随
  - 取代 v1.5.1 的 iOS 蓝方向（用户反馈「不够高级」，经方向确认选择暗色金融风）
- ✅ **验证 (Verified):**
  - DOM 校验：暗色下 --primary=#E4C066 / --surface=#0B0E13 / TabBar 磨砂圆角玻璃底 / 卡片发丝描边 + 阴影 / 主题色迁移后金色预设选中态正确
  - 浅色模式回归：暖象牙底生效、金色按钮深字对比度修复
  - `tsc --noEmit` strict + 构建通过
- 🐛 **修复 (Fixed):**
  - **记一笔 FAB 渲染卡顿**：玻璃栏容器误加 `overflow-hidden`，上探出栏体的 FAB 上半截被裁切区包住，叠加磨砂区域每帧重绘导致按压动画掉帧；移除裁切（内容本不溢出）+ `.tab-fab` 提升 `will-change: transform` / `translateZ(0)` 独立合成层，缩放动画走 GPU 合成不再重绘
  - **iOS 输入自动放大页面**：iOS Safari 聚焦 font-size < 16px 的输入框会强制缩放（日期/备注/邮箱/搜索框均为 14px，iPhone 记账一点输入就放大）；`@supports (-webkit-touch-callout: none)` 仅 iOS 下输入类元素统一 16px，其他平台保留原字号，捏合缩放不受影响
  - **呼出键盘时页面闪烁**：输入框被键盘遮挡 → iOS 平移整个视口 → 滚动锁又拽回来，一推一拉产生闪烁。改为 Sheet 面板自己抬到键盘上方（监听 `visualViewport.resize`，键盘高度 >120px 阈值时面板 bottom = 键盘高度、maxHeight 同步收缩），输入框始终可见，iOS 不再平移视口；ConfirmSheet/预算弹层等所有 Sheet 通用受益

### 🎯 待办与下一步 (TODO)
- [ ] 账号通道用户侧收尾：设置数据口令 + 再次同步使云端密文化
- [ ] 图表卡片化、收入构成环形图等进一步视觉升级（可选）
- [ ] **自动同步仍是单向整文件覆盖（Gist/WebDAV 通道）**：账号通道已用合并策略解决
- [ ] bills 的 `byUpdated` 索引确认用或删；`FullDump` 不含 settings（规格 §5.6）
- [ ] README Roadmap：标签系统、多币种、周期记账、资产管家

---

## [v1.5.1 - 2026-08-29] - 全局配色改版：黄色品牌色 → Apple 原生风 iOS 系统色

### 📝 更新详情
- ♻️ **优化 (Changed):**
  - **主色**：`--primary` 由鲨鱼黄 `#F5C518` 改为 iOS 系统蓝 `#007AFF`（暗色下同名值，PWA 主题色跟随设置）；`--danger`/`--success` 同步换 iOS 系统红 `#FF3B30`（暗色 `#FF453A`）/ 绿 `#34C759`（暗色 `#30D158`），收入支出红绿配色一并归位 iOS 语义色
  - **Header 去品牌大色块**：浅色模式页头由品牌色铺底改为中性分组灰 `#F2F2F7`（`--header-bg: var(--surface)`），`--header-fill` 改纯白胶囊——对照 iOS 原生（设置/图表页分段控件观感）；暗色维持 `#1C1C1E` 沉浸式不变
  - **主题预设**：`THEME_PRESETS` 换为 5 个 iOS 系统色（蓝 `#007AFF` / 靛 `#5856D6` / 青 `#30B0C7` / 绿 `#34C759` / 石墨 `#8E8E93`）；`--on-primary` 恒白
  - **状态栏/PWA**：meta theme-color 与 manifest `theme_color`/`background_color` 改中性灰（与页头一致，不再随主题色）；favicon（SVG data URI）与 PWA 图标经 `scripts/gen-icons.mjs` 重新生成为蓝底白 ¥
  - **SyncChip**：状态点硬编码 tailwind 色（`bg-green-500`/`bg-red-500`/`bg-yellow-500`）换成语义 token（`bg-success`/`bg-danger`/`bg-primary`），全项目回到"禁止硬编码颜色类"约定
- 📌 **设计决策 (Decisions):**
  - 配色只动品牌层、不动中性层：surface/card/fill/line/ink 本就是 iOS systemGray6/label 体系，保持不动使改动聚焦且零布局风险
  - 老用户迁移：settings persist 引入 `version: 1`，localStorage 里仍是旧默认 `#F5C518` 的静默迁到 `#007AFF`；自选过其他颜色的用户保留原选择
- ✅ **验证 (Verified):**
  - `npm run build` 通过（tsc strict + vite + PWA 产物）
  - 浏览器实测（Vite dev + 390×844 视口）：亮/暗双主题下明细、图表、设置、记一笔弹层全部无黄色残留；图表 周/月 分段控件、折线、排行榜进度条均呈 iOS 蓝；迁移逻辑实测（写入 v0 黄色配置 → 刷新自动变蓝）；DOM 实测无横向溢出
  - `--primary`/`--header-bg` 计算样式断言：`#007AFF` / `#f2f2f7`

---

## [v1.5.0 - 2026-08-29] - 账号模式：Supabase 邮箱认证 + 加密云保险库同步

### 📝 更新详情
- ✨ **新增 (Added):**
  - **账号认证**（`src/sync/account.ts`）：邮箱+密码注册/登录/找回密码/设置新密码，走 Supabase Auth（GoTrue）——密码散列存服务端，应用与数据库均不接触明文；会话持久化 + token 自动刷新 + 跨标签页广播；认证错误映射为中文（「邮箱或密码错误」「该邮箱已注册」等，不泄露服务端细节）
  - **云端保险库**（`vaults` 表，每用户一行）：同步 = 拉取云端 → 与本机按 id 并集、同 id 取 `updatedAt` 大者合并 → 推回，两端数据都不会被静默覆盖；本地零账单的新设备登录时直接采用云端整库（避免种子分类与云端重复）
  - **数据口令零信任加密**：上传前用口令做 PBKDF2-SHA256（60 万轮）+ AES-256-GCM 客户端加密，Supabase 只存密文；口令仅存本设备（换设备需重新输入），复用 `crypto.ts` 会话密钥缓存
  - **AccountPage**（懒加载路由 `/settings/account`）：登录/注册分段、忘记密码、找回密码后设新密码、已登录面板（数据口令管理/立即同步/上次同步时间与失败原因/退出登录/删除云端数据）；设置页入口仅在配置 Supabase 后出现
  - 密码类输入框（登录/注册/新密码/数据口令）补显示/隐藏切换按钮（Eye/EyeOff，`aria-label="显示密码/隐藏密码"`，切换后输入值保留）
  - **自动同步时机**：登录成功即同步一次；记一笔后 5s 防抖（复用 `scheduleSync` 入口）；网络恢复补跑；并发互斥 + 迟到触发补跑
  - **配置开关**：`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 构建期注入，两者齐备才启用；未配置时入口隐藏、代码按需加载，行为与 v1.4.0 完全一致
  - `docs/supabase-setup.md`：建表 SQL + RLS 策略 + Site URL/Secrets 配置 + 故障排查
- ♻️ **优化 (Changed):**
  - **包体**：supabase-js（218KB/gzip 58KB）拆独立 `supabase-*` chunk 并移出 SW 预缓存（同 chart.js 策略，首装预缓存从 566KB 压回 354KB）；`account.ts`（5KB）改为 manager/App 动态引入——不用账号功能的用户主包仅 +0.5KB（93.5KB/gzip 31.2KB）；AccountPage 本身 10KB 懒加载
  - `deploy.yml` 构建步骤注入 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` Secrets
- 📌 **设计决策 (Decisions):**
  - 纯前端无后端的"本地账号"是伪安全，因此选择 Supabase 做真认证（服务端散列 + RLS 行级隔离）；安全边界在 RLS 而非 anon key 保密（anon key 本就是公开密钥）
  - 合并策略沿用现有 `mergeDumps` 语义（union + updatedAt 胜出），不做服务端冲突分支——数据量级下整库快照最简单且无丢失风险
  - 凭证照片不参与账号云同步（体积原因，仅存本机），账号页有明确提示
- ✅ **验证 (Verified):**
  - **真机端到端（2026-08-29，用户自有 Supabase 项目）**：登录接口连通（GoTrue 200）→ 注册用户 → 邮箱确认 → 登录成功 → 触发自动同步 → 云端 `vaults` 表出现 92KB 快照（RLS 生效，仅本用户可见）；未确认邮箱登录正确返回「请先打开邮箱里的确认链接」
  - 排障记录：首测报「网络连接失败」，逐层排查（页面 fetch 分层探测 + DoH 解析）后定位为**项目 ref 抄写错误**（域名不存在，并非 DNS 污染），修正后直连畅通——校园网到 Supabase AWS 无需代理
  - 遗留提醒：未设数据口令时快照明文上传（`enc:false`，UI 有提示）；设置口令后需再次手动同步使云端变为密文
  - 未配置路径：设置页入口隐藏、直连 `/settings/account` 显示配置引导卡片，功能休眠不影响现有数据
  - 配置态（假项目地址）：入口出现、登录表单渲染、邮箱格式校验（请输入正确的邮箱地址）、密码长度校验（密码至少 8 位）、真实 supabase 客户端请求失败映射（网络连接失败，请检查网络）全链路通过
  - `tsc --noEmit` strict 通过

### 🎯 待办与下一步 (TODO)
- [ ] **自动同步仍是单向整文件覆盖（Gist/WebDAV 通道）**：双设备先后 push 会静默覆盖对方较新快照；账号通道已用合并策略解决，Gist/WebDAV 计划引入 pull → `mergeDumps` → push 或 `exportedAt` 冲突检测
- [ ] 账号通道端到端真机验证（需用户创建 Supabase 项目并配置 Secrets）
- [ ] 引入 vitest：`mergeDumps`/`validateDump`/`compressImage` 补单元测试
- [ ] bills 的 `byUpdated` 索引从未被查询（增量同步预留），确认用或删
- [ ] `FullDump` 不含 settings（规格 §5.6），涉及导入恢复语义，独立任务
- [ ] README Roadmap：标签系统、多币种、周期记账、资产管家

---

## [v1.4.0 - 2026-08-29] - 记一笔支持凭证照片

### 📝 更新详情
- ✨ **新增 (Added):**
  - **凭证照片**：EntrySheet 新增「照片」入口（`Camera` 按钮，多选/手机直接调起相机），每笔最多 3 张；明细列表行内 40px 缩略图（无照片的行零开销）；点击缩略图全屏 `PhotoViewer` 查看（点击遮罩/Escape 关闭）
  - `src/utils/image.ts` 压缩管线：最长边压到 1280px、JPEG 0.82，`createImageBitmap` 按 EXIF 方向解码（iPhone 拍摄横竖屏不再颠倒），单张控制在 ~200KB 量级，避免 IndexedDB 膨胀
  - **IndexedDB schema v2**：新增 `photos` 表（`byBill` 索引），老库自动迁移（实测 v1→v2 升级后 357 笔数据完好）
  - 编辑账单可增删照片：移除并保存后照片记录即清理（`upsertBill` 差异清理）；账单 30 天回收站到期彻底删除时连带清理照片
  - 保存失败重试安全：照片落库后带 `storedId` 标记，写失败保留面板重试不会重复入库；新建流程照片先挂 `pending` 占位、账单生成后 `reassignPhoto` 迁移归属
- 📌 **设计决策 (Decisions):**
  - 照片仅存本地 IndexedDB，**不进 JSON 备份/云同步通道**（Gist/WebDAV 走 JSON，体积不合适）；恢复备份后账单保留 `photoIds`，照片缺失时缩略图/编辑回填显示占位图标，不崩溃
- 🐛 **修复 (Fixed):**
  - **CSP 拦截 blob: 图片**：构建注入的 `img-src 'self' data:` 会把所有凭证图片（blob: URL）在生产构建下拦成裂图（缩略图/查看器/面板回填全中招），补 `blob:` 后 `naturalWidth > 0` 确认真实渲染
- ✅ **验证 (Verified):**
  - 浏览器端到端：选图 → 压缩 → 落库 → 挂账单 → 列表缩略图 → 大图查看 → 编辑删照 → 孤儿记录清理（3→2）全链路通过
  - `tsc --noEmit` strict 通过

### 🎯 待办与下一步 (TODO)
- [ ] **自动同步仍是单向整文件覆盖**：双设备先后 push 会静默覆盖对方较新快照（数据丢失风险）；计划引入 pull → `mergeDumps` → push 流程或 `exportedAt` 冲突检测
- [ ] 照片备份：如需跨设备迁移图片，可做可选的二进制备份通道（R2/WebDAV 直传 zip），独立任务
- [ ] bills 的 `byUpdated` 索引从未被查询（增量同步预留），确认用或删
- [ ] `FullDump` 不含 settings（规格 §5.6），涉及导入恢复语义，独立任务
- [ ] README Roadmap：标签系统（`tags`/`tagIds` 脚手架已就绪）、多币种、周期记账、资产管家

---

## [v1.3.1 - 2026-08-29] - 性能专项二期：热点路径去重算 + 长列表跳过渲染 + 交互减渲

### 📝 更新详情
- ♻️ **优化 (Changed):**
  - **明细页每日小计移入 `groups` useMemo**：此前日期收入/支出小计写在渲染体里，对每组做两遍 `filter+reduce`——搜索每敲一个字符就全量重算 O(组×账单)；现随分组一次算好
  - **发现页当月账单只扫一遍**：收入/支出合计与本月洞察共用同一个 `monthList`（此前 `monthBills` 全量过滤跑两次）；洞察"最高单笔"由 `categories.find`（O(账单×分类)）改为 id→名称 Map；图表页排行榜同理改 Map 索引
  - **`stats.monthBills` 单遍化**：组合谓词一次遍历完成，去掉"先过滤账本再过滤月份"的中间数组分配（明细/图表/发现页每次数据变更都走这条路径）
  - **长列表跳过渲染**：明细页账单行加 `content-visibility: auto`（`.cv-auto`，`contain-intrinsic-size: auto 68px` 记住实际高度，滚动无跳动）——视口外的行不再参与布局与绘制，账单越多收益越明显
  - **记一笔面板减渲**：分类网格/账户行抽成 `memo` 子组件（`CatGrid`/`AccChips`），`NumberKeyboard` 整体 `memo`——金额键盘每敲一键、输备注、换日期时不再重渲整个面板
  - **跨标签页 reload 防抖**：对方每次写操作都广播一条消息，本页此前逐条全量 `getAll` 重载；现 250ms 防抖合并为一次（回前台的 5s 节流不变）
- ✅ **验证 (Verified):**
  - `tsc --noEmit` strict 通过；构建主包 87.3KB / gzip 29.3KB（+0.4KB 为新增代码，无回归）
  - 浏览器冒烟：插入 357 笔演示数据，当月 119 行全量渲染、按日分组与小计正确、分类 chips/搜索栏正常，`content-visibility` 在全部账单行生效

### 🎯 待办与下一步 (TODO)
- [ ] **自动同步仍是单向整文件覆盖**：双设备先后 push 会静默覆盖对方较新快照（数据丢失风险）；计划引入 pull → `mergeDumps` → push 流程或 `exportedAt` 冲突检测
- [ ] bills 的 `byUpdated` 索引从未被查询（增量同步预留），确认用或删
- [ ] `FullDump` 不含 settings（规格 §5.6），涉及导入恢复语义，独立任务
- [ ] 明细页如需支撑数千行/月，可再上虚拟滚动（当前 content-visibility 已覆盖大部分收益）
- [ ] README Roadmap：标签系统（`tags`/`tagIds` 脚手架已就绪）、多币种、周期记账、资产管家

---

## [v1.3.0 - 2026-08-29] - 性能 / 代码质量 / 体验三方面优化

### 📝 更新详情
- ✨ **新增 (Added):**
  - `src/utils/stats.ts` 共享聚合模块：`ledgerBills` / `monthBills` / `sumByType` / `categoryTotals`，明细/图表/发现页四处重复的月度筛选谓词与收支聚合收敛到一处
  - `PageSkeleton` 路由加载骨架屏（规格 §5.0 首帧加载态），懒加载路由切换时显示
  - Sheet 弹层无障碍：`role="dialog"` + `aria-modal`、Escape 关闭、打开聚焦面板/关闭归还焦点、Tab 焦点循环陷阱；NumberKeyboard 退格键补 `aria-label`；Toasts 补 `role="status" aria-live="polite"`
- ♻️ **优化 (Changed):**
  - **渲染链路**：`sync()` 按集合做引用稳定化（逐项比较快照，未变化的表复用旧数组引用）+ 13 处 `useData()/useSettings()` 整 store 订阅全部改为逐字段 selector——记一笔不再触发设置页、图表页等无关组件重渲
  - **首屏包体**：9 个非首屏路由改 `React.lazy` 懒加载 + `manualChunks` 拆出 react-vendor，主包从 ~297KB 降到 87KB（gzip 29KB）
  - **Chart.js 实例复用**：数据/主题变化时在实例上 `chart.update()` 增量更新，不再销毁重建，消除画布闪烁与重复初始化开销
  - **PWA 预缓存瘦身**：208KB 的图表块移出首装预缓存（`globIgnores`），补 `runtimeCaching`（CacheFirst）——不看图表的用户首装少下载 208KB，访问过图表页后离线仍可用
  - `visibilitychange` 触发的全量 `repo.reload()` 加 5 秒节流（跨标签页变更已有 BroadcastChannel 覆盖，此处仅兜底）
  - `appVersion` 改为构建期从 package.json 注入（`__APP_VERSION__`），不再硬编码 '1.0.0'
  - `date.pad2` 导出复用，消除 MonthPicker 的重复实现
- 🐛 **修复 (Fixed):**
  - **EntrySheet 写失败误报**：存储写入失败（配额满/存储损坏）时不再 toast「已记一笔」并关面板，改为报错并保留面板（规格 §5.1）。注意 repo 吞掉 IDB 异常、promise 永不 reject，通过检查 `writeFailed` 实现
  - **MonthPicker 年份残留**：组件常驻不卸载，`useState` 只初始化一次——选过 2025 年关闭后再开仍停在 2025；现打开时同步回当前值
  - **BackupPage 每字符写 IDB**：配置改为 400ms 防抖落盘，卸载与手动同步前强制 flush
  - 预算编辑回填改用 `toYuanTrim`（12 而非 12.00），与账单编辑回填口径一致

### 🎯 待办与下一步 (TODO)
- [ ] **自动同步仍是单向整文件覆盖**：双设备先后 push 会静默覆盖对方较新快照（数据丢失风险）；计划引入 pull → `mergeDumps` → push 流程或 `exportedAt` 冲突检测
- [ ] bills 的 `byUpdated` 索引从未被查询（增量同步预留），确认用或删
- [ ] `FullDump` 不含 settings（规格 §5.6），涉及导入恢复语义，独立任务
- [ ] README Roadmap：标签系统（`tags`/`tagIds` 脚手架已就绪）、多币种、周期记账、资产管家

---

## [v1.2.0 - 2026-08-27] - 稳健性专项：存储写入感知 + 数据正确性修复 + 列表渲染性能优化

### 📝 更新详情
- ✨ **新增 (Added):**
  - `repo.writeFailed` 持久化写入失败标记：IDB/localStorage 写失败（配额满/存储损坏）不再被静默吞掉，经 store 透传后在 App 顶部显示红色横幅提醒立即导出（此前界面"已记一笔"但实际可能未落盘）
  - `money.toYuanTrim()`：整数分→元字符串并去尾零（1250→"12.5"），供编辑回填等紧凑展示复用
- ♻️ **优化 (Changed):**
  - **DetailPage 列表性能**：`BillRow` 改为 `memo` 组件 + `useCallback` 稳定回调 + 分类 `id→对象` Map 索引；搜索输入等父组件重渲不再逐行重渲账单，搜索过滤由 O(账单×分类) 降为 O(账单)
  - **crypto 同步开销**：PBKDF2（60 万轮）派生密钥会话内缓存，加密盐复用（每次仍生成随机 IV 保证 GCM 安全），自动同步不再每次重算密钥，降低移动端 CPU/电量消耗
  - **跨天口径**：ChartPage / DiscoverPage 时间基线改为 state，PWA 从后台恢复（visibilitychange）时刷新，跨天后"今天/本月/日均"不再停留在昨天
  - ChartPage 周视图改按日历日 key 分桶，DST 时区（一天 23/25 小时）不再把账单分错桶
  - EntrySheet 编辑回填改用 `toYuanTrim` 整数运算，不再绕过分→元换算
- 🐛 **修复 (Fixed):**
  - **长按删除误触发**：账单行补 `onTouchCancel` + 组件卸载清理计时器——系统手势打断长按、切月/同步刷新导致行消失时，不再莫名弹出"删除确认"
  - **「较上月同期」月末溢出**：3/31 等场景 `Date(y, m-1, 31)` 归一化把截止日推到本月，环比口径错误；现按上月实际天数截断（`Math.min(今日, 上月天数)`）
  - **DiscoverPage useMemo 全失效**：渲染体中 `new Date()` 作为依赖导致洞察（两遍全量账单扫描）每次渲染重算，预算输入每敲一个字都触发——与 ChartPage 同款问题，已改为稳定 state
  - **畸形备份导入后崩溃**：`validateDump` 补全 `tagIds/note/accountId/ledgerId/deletedAt` 校验与 `amountCents` 安全整数校验，并对缺失字段归一化（`tagIds ?? []` 等）；此前 `tagIds: null` 的备份可导入但在 CSV 导出处崩溃（`ids.map is not a function`）
  - **解密错误分类**：口令错误 / base64 损坏 / 解密成功但 JSON 无效三种情况分开提示，不再一律误导用户"口令错误"
  - gist/webdav `pull` 守卫 JSON 解析，云端文件损坏时抛中文错误而非英文 SyntaxError 泄入 UI
  - `deleteDB('shark-probe')` 补 catch，多标签页场景不再产生未处理的 Promise rejection
  - **跨标签页同步盲区**：分类/账户/账本/预算的增删改此前不广播（仅账单广播），另一标签页不刷新；统一收敛到 `commit()`（广播+通知）；`reload()` 一并刷新 meta，避免 syncConfig 跨标签页读到旧值
- 🗑️ **移除 (Removed):** 死代码 `money.addCents`（全仓库无调用）

### 🎯 待办与下一步 (TODO)
- [ ] **自动同步仍是单向整文件覆盖**：双设备先后 push 会静默覆盖对方较新快照（数据丢失风险）；计划引入 pull → `mergeDumps` → push 流程或 `exportedAt` 冲突检测
- [ ] 10 处组件整 store 订阅（`useData()` 无 selector）：任何数据变更会重渲所有已挂载页面；计划按实体拆 slice 或用 `useShallow`
- [ ] BackupPage 配置每敲一个字符即写 IDB，需防抖（500ms 或失焦保存）
- [ ] Chart.js 数据变化时销毁重建实例，可改为 `chart.update()` 增量更新
- [ ] bills 的 `byUpdated` 索引从未被查询（增量同步预留），确认用或删
- [ ] `repo.fullDump()` 的 `appVersion` 硬编码 '1.0.0'，与 package.json 版本脱节
- [ ] README Roadmap：标签系统（`tags`/`tagIds` 脚手架已就绪）、多币种、周期记账、资产管家

---


## [v1.1.0 - 2026-08-27] - 迭代基线补录（建立本文档）

### 📝 更新详情
- ✨ **新增 (Added):** 建立迭代日志文档 ITERATION_LOG.md，补录当前项目基线状态（此前的开发迭代缺少系统记录）
- ♻️ **优化 (Changed):** 无（本次仅建立文档，未改动代码）
- 🐛 **修复 (Fixed):** 无
- 🗑️ **移除 (Removed):** 无

### 📌 当前项目基线快照（v1.1.0）
- **技术栈：** Vite 5 + React 18 + TypeScript (strict) + TailwindCSS 3.4 + Zustand 4 + React Router 6 + Chart.js 4 + idb (IndexedDB) + vite-plugin-pwa
- **核心功能：** 记一笔（自绘数字键盘、连续记账）、明细（按日分组/搜索/30 天回收站）、图表（周/月/年趋势 + 分类排行）、预算 + 洞察、多账本、CSV/JSON 导入导出、云备份（Gist/WebDAV/R2，AES-GCM 加密）、暗夜模式、存储三级降级（IndexedDB → localStorage → 内存）
- **架构：** `src/` 下分 components / pages / features / db / sync / store / utils；金额一律整数分存储；部署至 GitHub Pages（自动 workflow）

### 🎯 待办与下一步 (TODO)
- [ ] 标签系统（来自 README Roadmap）
- [ ] 多币种支持（来自 README Roadmap）
- [ ] 周期记账（来自 README Roadmap）
- [ ] 资产管家（来自 README Roadmap）

---
