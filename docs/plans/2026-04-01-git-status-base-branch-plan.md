# Git Status 一等视图与 Base Branch 配置化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为工作区面板新增正式的 `Git Status` 视角，并让 `全部分支更改` 支持按工作区配置 `baseBranch`。

**Architecture:** 继续沿用已落地的 `WorkspaceModel`。前端在 `WorkspaceModel.branch.baseBranch` 中持有按 `cwd` 配置的基线分支，在 `WorkspaceModel.diff.selectedMode` 中新增 `gitStatus`。bridge 在 `workspace-diff-mode` 接口中支持可选 `baseBranch` 参数，`CodePreviewPanel` 则新增 `Git Status` tab 和 `branch` 模式下的基线分支切换 UI。

**Tech Stack:** Vue 3、TypeScript、Express bridge、Git CLI、本地存储、现有 `WorkspaceModel`

---

### Task 1: 扩展工作区模式与 baseBranch 类型

**Files:**
- Modify: `src/types/codex.ts`

**Step 1: 扩展 `UiWorkspaceDiffMode`**

- 新增 `gitStatus`

**Step 2: 确认 `WorkspaceModel.branch.baseBranch` 作为正式字段使用**

- 保持现有类型兼容
- 不再只作预留字段

**Step 3: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 2: 在状态层持有并持久化 baseBranch

**Files:**
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/composables/desktop-state/storage.ts`

**Step 1: 增加 `cwd -> baseBranch` 的本地存储**

- 新增读取与保存函数
- 作用域限定为本地工作流偏好

**Step 2: 将 `baseBranch` 写入 `WorkspaceModel.branch`**

- 创建 workspace 时加载
- 切换时同步更新

**Step 3: 增加 setter**

- 如 `setWorkspaceBaseBranch(cwd, branch)`

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 3: 让 bridge 的 branch diff 支持可选 baseBranch

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexRpcClient.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 扩展 `/codex-api/workspace-diff-mode`**

- 支持 `baseBranch` 查询参数

**Step 2: 在 `mode=branch` 时优先使用传入 baseBranch**

- 若 baseBranch 有效，使用它计算 merge-base
- 若无效，返回 warning 并回退自动推导

**Step 3: 返回实际使用的 baseRef**

- 保证 UI 可解释当前比较基线

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 4: 在工作区面板加入 Git Status tab

**Files:**
- Modify: `src/components/content/CodePreviewPanel.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 增加第 5 个 mode tab**

- `gitStatus`

**Step 2: 渲染 Git Status 视图**

- 顶部摘要：当前分支、dirty summary、blockers
- 列表：`dirtyEntries`

**Step 3: 保持其他 4 个 diff 模式行为不变**

- 不影响现有 patch 渲染

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 5: 在 branch 视角加入 baseBranch 切换入口

**Files:**
- Modify: `src/components/content/CodePreviewPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/i18n/uiText.ts`

**Step 1: 在 branch 模式顶部显示当前 `baseBranch`**

- 清楚展示当前比较关系

**Step 2: 增加轻量切换控件**

- 候选为当前工作区本地分支列表
- 切换后刷新 branch snapshot

**Step 3: 确保切换只影响当前 `cwd`**

- 不扩展为全局仓库设置

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 6: 回填文档并补验收说明

**Files:**
- Modify: `docs/plans/2026-04-01-git-status-base-branch-design.md`
- Modify: `docs/plans/2026-04-01-git-status-base-branch-plan.md`
- Modify: `docs/plans/2026-04-01-workspace-model-unification-design.md`

**Step 1: 回填已完成行为**

- 记录 `Git Status` 已成为一等视图
- 记录 baseBranch 的作用域与限制

**Step 2: 补验收场景**

- dirty 但 diff totals 为 0
- branch 模式指定非 `main/master` 基线
- baseBranch 失效回退 warning

**Step 3: 运行构建验证**

Run: `npm run build`  
Expected: PASS

## 当前执行进度

- 已完成：Task 1、Task 2、Task 3、Task 4、Task 5
- 已完成：Task 6 文档回填

当前这条增强主线已经完成了“Git Status 成为一等视图”和“baseBranch 可按工作区配置”的核心实现，后续重点将转向：

- 优化 `baseBranch` 自动推导策略
- 评估是否移除 [src/App.vue](src/App.vue) 中剩余的 `workspaceDirtyHiddenNotice`
- 评估统一 `workspace-inspector` 接口
