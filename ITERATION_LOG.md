# 🦈 鲨鱼记账 · 迭代日志 (Iteration Log)

> 本文档记录项目每次代码修改、功能新增与 Bug 修复。新条目追加在最上方。

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
