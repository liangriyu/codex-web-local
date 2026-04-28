# Diff Panel Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为当前右侧差异预览区增加 4 种可切换的差异模式：未暂存、已暂存、全部分支更改、上一轮更改，使工作区差异浏览更接近 Codex app 的统一差异面板体验。

**Architecture:** 在 bridge 层新增统一的 workspace diff mode 接口，根据 mode 选择不同 Git 命令并返回统一的文件列表 + patch 结构。前端在现有预览面板上增加模式切换状态，不同模式共享同一文件列表与 diff 展示 UI。第一阶段不把 Git Status 合并进来，只聚焦 4 种 diff 视角。

**Tech Stack:** Vue 3、TypeScript、Express-style bridge、Node `child_process.execFile`、Git CLI

---

### Task 1: 定义差异模式类型

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 增加前端模式枚举**

- 新增 `UiWorkspaceDiffMode`：
  - `unstaged`
  - `staged`
  - `branch`
  - `lastCommit`

**Step 2: 增加统一返回类型**

- 为模式化 diff 返回增加 `mode`、`label`、`baseRef`、`targetRef`。

### Task 2: 在 bridge 层实现统一 diff mode 接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 抽象按模式读取文件列表与 patch**

- `unstaged`
- `staged`
- `branch`
- `lastCommit`

**Step 2: 补基线分支解析**

- 优先 `main`
- 回退 `master`
- 都不存在时返回明确空结果/说明

**Step 3: 新增 HTTP 接口**

- 建议新增：
  - `GET /codex-api/workspace-diff-mode?cwd=...&mode=...`

### Task 3: 接入前端 API

**Files:**
- Modify: `src/api/codexRpcClient.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 新增模式化 diff 请求**

- 支持 `cwd + mode`

**Step 2: 做返回归一化**

- 统一成前端可直接消费的数据结构

### Task 4: 在 App 状态中管理差异模式

**Files:**
- Modify: `src/App.vue`

**Step 1: 增加当前差异模式状态**

- 打开工作区差异面板时带 mode
- 默认优先 `unstaged`

**Step 2: 接入模式切换加载**

- 切换 mode 时重新加载对应 diff 数据

### Task 5: 升级预览面板 UI

**Files:**
- Modify: `src/components/content/CodePreviewPanel.vue`
- Optional Create: `src/components/content/WorkspaceDiffModeTabs.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 增加 4 个模式 tab**

- 未暂存
- 已暂存
- 全部分支更改
- 上一轮更改

**Step 2: 增加模式说明**

- `全部分支更改：当前分支相对 main/master 的累计改动`
- `上一轮更改：最近一次提交的改动`

**Step 3: 保持现有文件列表与 patch 阅读体验**

- 不重做整个 diff UI
- 只在头部增强模式切换

### Task 6: 空状态与异常处理

**Files:**
- Modify: `src/components/content/CodePreviewPanel.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 空结果说明**

- 模式无结果时明确提示

**Step 2: 基线分支缺失说明**

- `branch` 模式下找不到 `main/master` 时给出明确提示

### Task 7: 文档与验证

**Files:**
- Modify: `docs/plans/2026-04-01-diff-panel-design.md`
- Modify: `docs/plans/2026-04-01-diff-panel-implementation-plan.md`

**Step 1: 构建验证**

Run: `npm run build`
Expected: PASS

**Step 2: 手动验证**

- 打开差异面板
- 依次切换 4 个模式
- 验证每个模式都能稳定显示结果或明确空状态

**Step 3: 回填执行结果**

- 记录实际完成项、偏差、验证结果、后续待办

### 风险与回滚

- 风险：`branch` 模式的 base branch 固定为 `main/master`，不一定覆盖所有仓库实际基线。
- 风险：大分支累计 diff 可能导致面板加载变慢。
- 回滚：移除 mode 化接口和前端 tab，恢复当前单一 workspace diff 面板。

### 验收与验证命令

- 面板内可切换 4 个差异模式。
- 每种模式语义明确且可稳定显示。
- `npm run build` 通过。

## 执行结果

### 实际完成项

- 已新增 `UiWorkspaceDiffMode` 与 `UiWorkspaceDiffSnapshot`，统一模式化差异返回结构。
- 已在 bridge 中新增 `GET /codex-api/workspace-diff-mode`，支持：
  - `unstaged`
  - `staged`
  - `branch`
  - `lastCommit`
- 已在前端 API 层增加模式化 diff 读取与归一化。
- 已在 `App.vue` 中增加当前差异模式状态，并支持打开面板时按默认规则选择模式。
- 已在 `CodePreviewPanel.vue` 中增加 4 个模式切换 tab、模式说明、ref 展示和空状态 / warning 展示。
- 已在 `uiText.ts` 中补充分支差异面板相关文案。

### 实际偏差

- 当前“全部分支更改”模式的基线分支仍固定为 `main -> master` 回退，没有额外配置入口。
- 当前只完成 4 个 diff 模式，没有把 `Git Status` 作为第 5 个 tab 一起纳入。
- 手动验证目前只完成了构建验证，尚未在浏览器态逐模式录一轮 UI 交互结果。

### 验证结果

- 2026-04-01：执行 `npm run build` 通过。

### 后续待办

- 在真实页面里依次验证 4 个模式的切换结果和空状态文案。
- 评估是否把现有 `workspaceDirtyHiddenNotice` 演进为正式的 `Git Status` tab，而不再停留在提示块。
