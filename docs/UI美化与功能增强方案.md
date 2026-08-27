# 鲨鱼记账 · UI 美化与功能增强方案

> 日期：2026-08-27 ｜ 状态：待执行 → 已执行
> 范围：不改动数据模型与存储层（schema v1 不动），全部为展示层与交互层增强。

---

## 一、现状评估

### 1.1 已达标（不动）

| 维度 | 现状 |
|---|---|
| 主题体系 | 语义化 CSS token（surface/card/fill/line/ink…），暗夜模式全量换值，无硬编码色 |
| 组件 | Sheet / Toast / 数字键盘 / MonthPicker 全自绘，风格统一 |
| 信息架构 | 明细 / 图表 / 发现 / 我的 四 Tab + 中央加号，符合记账 App 主流范式 |
| 性能 | BillRow memo + 稳定回调；Chart.js 路由级懒加载；金额整数分存储 |

### 1.2 UI 短板（美化项）

| # | 位置 | 问题 | 方案 |
|---|---|---|---|
| U1 | 明细页 Header | 收入/支出挤在右上角两行小字，无结余展示，数字层级弱 | 重构为 收入/支出/结余 三段式，结余正负分色 |
| U2 | 图表页 | 折线图无填充、直线连接，视觉"工程感"重 | 主色渐变区域填充 + 平滑曲线（tension）+ 加粗描边 |
| U3 | 发现页预算环 | 百分比跳变无过渡，动画感缺失 | `stroke-dasharray` CSS transition，进入页面时从 0 环绕到目标值 |
| U4 | 明细 BillRow | 点按无任何按压反馈，列表"死板" | `active:bg-surface` 按压态 |
| U5 | 空状态 | 纯静态，突兀 | 入场 fade + 上移动画（复用/扩展现有 keyframes） |
| U6 | TabBar 加号 | 平铺色，浮起感不足 | 品牌色渐变 + 增强阴影 + 呼吸光晕（subtle） |

### 1.3 功能缺口

| # | 功能 | 依据 | 优先级 |
|---|---|---|---|
| F1 | **CSV 导入** | README 承诺"CSV / JSON 一键导入导出"，实际只有 CSV 导出 + JSON 导入，导入链路残缺 | P0 |
| F2 | **明细页分类筛选** | 目前仅全文搜索，无法按分类快速过滤（记账 App 高频操作） | P1 |
| F3 | 标签系统 / 多币种 / 周期记账 / 资产管家 | README Roadmap 已列 | 后续迭代，本轮不做 |

---

## 二、实施方案

### 2.1 F1 · CSV 导入（P0）

**文件**：`src/utils/csv.ts`、`src/pages/settings/DataPage.tsx`

- 新增 `parseCSVToBills(text, { cats, accounts, ledgerId })`：
  - 剥 BOM（`\ufeff`），按 `\r\n` / `\n` 分行；
  - 完整 CSV 解析器（处理引号包裹、`""` 转义、逗号），不用 `split(',')`；
  - 列序与导出一致：`日期,类型,分类,金额(元),账户,标签,备注`；首行表头自动跳过；
  - 日期 `YYYY-MM-DD` → `occurredAt = new Date(y, m-1, d, 12:00)`（与 EntrySheet 同口径）；
  - 金额走既有 `parseYuanToCents`；类型仅认「支出/收入」；
  - 分类按 `name + type` 匹配，匹配不到：支出 → 内置「日用」，收入 → 内置「其他」；
  - 账户按名匹配，找不到留空；
  - 解析失败的行跳过并计数，返回 `{ bills, skipped }`；
  - id 用 `uuid()`（`utils/compat`），不与 demo 数据冲突。
- DataPage 增加「导入 CSV」按钮：选文件 → 弹 Sheet 显示"将导入 N 笔（跳过 M 行）"→ 确认后 `repo.insertBills()` 合并导入（不覆盖现有数据）→ toast 结果。

### 2.2 F2 · 明细页分类筛选（P1）

**文件**：`src/pages/DetailPage.tsx`

- 搜索栏下方增加分类横滑 chips（当月有账单的分类 + "全部"）；
- 状态 `filterCat: string`（空 = 全部）；
- `filtered` memo 中叠加 `!filterCat || b.categoryId === filterCat` 条件；
- 与文本搜索可叠加生效；切换月份时保留筛选。

### 2.3 U1 · 明细页 Header 重构

**文件**：`src/pages/DetailPage.tsx`

- 右侧改为「收入 / 支出 / 结余」三列小标签 + 数值的紧凑排版；
- 结余 < 0 用 `--danger`、≥ 0 用默认色；
- 保持现有隐藏金额（hideAmount）与 SyncChip / 明暗眼图标行为不变。

### 2.4 U2 · 图表美化

**文件**：`src/pages/ChartPage.tsx`

- 折线 `tension: 0.35` 平滑；
- `fill: true` + canvas 线性渐变（主色 22% → 透明）；
- 描边 `borderWidth: 2`、主色描边；均值虚线保留；
- 渐变色从 CSS 变量 `--primary` 读取，跟随主题与自定义主题色。

### 2.5 U3 · 预算环动画

**文件**：`src/pages/DiscoverPage.tsx`、`src/index.css`

- 环形 `<circle>` 加 `transition: stroke-dasharray 0.8s ease`；
- 组件挂载/预算变化时 dasharray 从 `0 C` 过渡到目标值（首帧用 state 触发）。

### 2.6 U4/U5/U6 · 微交互

**文件**：`DetailPage.tsx`（BillRow）、`EmptyState.tsx`、`TabBar.tsx`、`index.css`

- BillRow：`active:bg-surface`（卡片列表标准按压态）；
- EmptyState：新增 `.fade-up` keyframes（opacity 0→1 + translateY 8px→0，0.35s）；
- TabBar 加号：`bg-gradient-to-b from-[var(--primary)] …` 渐变 + 双层阴影。

---

## 三、验收标准

1. `npx tsc --noEmit` 零错误；
2. dev server 正常运行，四 Tab + 设置各页无白屏、无 console 报错；
3. CSV 导入：导出的 CSV 原样导入 → 笔数一致、金额/分类/账户/备注无损；坏行被跳过并计数；
4. 明细页筛选 + 搜索叠加过滤正确，空结果显示"没有找到相关账单"；
5. 暗色模式下所有新样式可读（渐变/按压态/动画色均来自 token）。

## 四、不做清单（明确范围）

- 左滑删除（现有长按删除已覆盖，避免两套手势冲突）；
- 页面级转场动画（收益/成本比低）;
- Roadmap 大项（标签/多币种/周期记账/资产管家）单独立项。
