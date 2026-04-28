# 统一工作区模型 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前分散在分支菜单、工作区守卫、差异面板和页面编排中的工作区逻辑，渐进收敛为统一的 `WorkspaceModel`。

**Architecture:** 先在前端定义一等 `WorkspaceModel`，由 `useDesktopState` 统一持有按 `cwd` 缓存的工作区对象，再逐步把 `App.vue` 中的工作区规则和 `CodePreviewPanel.vue` 的局部输入切换为围绕 `WorkspaceModel` 协作。暂不立即改造 bridge 协议，而是先复用现有事实接口完成模型收敛。

**Tech Stack:** Vue 3、TypeScript、Express bridge、Git CLI、现有 `codexGateway`/`useDesktopState` 状态体系

---

### Task 1: 定义 WorkspaceModel 基础类型

**Files:**
- Modify: `src/types/codex.ts`

**Step 1: 补充工作区统一模型类型**

- 新增 `WorkspaceModel`
- 新增 `WorkspaceGuardState`
- 新增 `WorkspaceBranchState`
- 新增 `WorkspaceDiffState`
- 新增 `WorkspaceApprovalState`
- 保持与现有 `UiWorkspaceBranchState`、`UiWorkspaceDiffSnapshot`、`UiWorkspaceDirtyEntry` 兼容

**Step 2: 确认命名边界**

- 保留现有 `Ui*` 类型用于 API / 组件边界
- 使用 `WorkspaceModel` 作为前端状态层的一等对象

**Step 3: 运行构建验证**

Run: `npm run build`  
Expected: PASS

**Step 4: Commit**

```bash
git add src/types/codex.ts
git commit -m "refactor: 定义统一工作区模型类型"
```

### Task 2: 在 useDesktopState 中建立 workspaceByCwd

**Files:**
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/types/codex.ts`

**Step 1: 新增工作区 store**

- 增加 `workspaceByCwd`
- 增加 `selectedWorkspaceModel`
- 增加按 `cwd` 读取/创建 `WorkspaceModel` 的帮助函数

**Step 2: 把现有 branch / guard / approvals 状态写回 WorkspaceModel**

- 分支状态刷新时同步更新 `workspaceByCwd[cwd].branch`
- blocker 计算结果同步写入 `workspaceByCwd[cwd].guard`
- live / persisted approvals 聚合结果同步写入 `workspaceByCwd[cwd].approvals`

**Step 3: 保留旧字段作为兼容层**

- 在迁移完成前保留现有 `workspaceBranchStateByCwd`、`selectedWorkspaceBranchState` 等对外字段
- 让旧字段由 `WorkspaceModel` 派生，避免一次性改穿所有调用点

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/codex.ts src/composables/useDesktopState.ts
git commit -m "refactor: 在状态层引入统一工作区 store"
```

### Task 3: 下沉 App.vue 的工作区规则

**Files:**
- Modify: `src/App.vue`
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 下沉默认差异模式逻辑**

- 将“先尝试 `unstaged`，为空再回退 `staged`”的逻辑从 `App.vue` 下沉到 workspace store
- 由状态层维护 `diff.selectedMode`

**Step 2: 统一工作区入口 totals 语义**

- 明确入口显示的是“工作区总改动”还是“当前模式 totals”
- 将 totals 计算逻辑收口到 `WorkspaceModel`

**Step 3: App.vue 仅消费 selectedWorkspaceModel**

- `App.vue` 只做工作区面板打开/关闭和事件转发
- 不再直接拼工作区语义

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/App.vue src/composables/useDesktopState.ts
git commit -m "refactor: 下沉页面层工作区规则"
```

### Task 4: 让 CodePreviewPanel 围绕 WorkspaceModel 渲染

**Files:**
- Modify: `src/components/content/CodePreviewPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/types/codex.ts`

**Step 1: 调整面板输入**

- 将工作区预览输入切换为 `WorkspaceModel` 或以 `WorkspaceModel.diff` 为主的结构
- 减少组件对零散 `snapshot`、`warning`、`ref` 的直接耦合

**Step 2: 保持多模式差异面板现有行为不变**

- `unstaged / staged / branch / lastCommit` 行为保持一致
- ref、warning、empty state 继续渲染，但数据来源改为 `WorkspaceModel`

**Step 3: 为 Git Status 正式入 panel 预留接口**

- 不要求本任务立刻实现 `Git Status` tab
- 但要确保组件结构已经允许未来直接消费 `workspace.gitStatus`

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/App.vue src/components/content/CodePreviewPanel.vue src/types/codex.ts
git commit -m "refactor: 让差异面板消费统一工作区模型"
```

### Task 5: 清理兼容层并补文档

**Files:**
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/App.vue`
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `docs/plans/2026-04-01-workspace-model-unification-design.md`
- Modify: `docs/plans/2026-04-01-workspace-model-unification-plan.md`

**Step 1: 清理不再需要的旧工作区派生状态**

- 删除明显冗余的工作区局部缓存
- 确保分支菜单和工作区面板都从 `WorkspaceModel` 读取

**Step 2: 回填实现结果到设计文档**

- 在设计文档中补充“已完成”与“后续阶段”边界
- 保持计划文档与实际迁移路径一致

**Step 3: 运行构建验证**

Run: `npm run build`  
Expected: PASS

**Step 4: Commit**

```bash
git add src/composables/useDesktopState.ts src/App.vue src/components/content/ThreadComposer.vue docs/plans/2026-04-01-workspace-model-unification-design.md docs/plans/2026-04-01-workspace-model-unification-plan.md
git commit -m "refactor: 收敛工作区逻辑到统一模型"
```

### Task 6: 后续增强候选项

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/components/content/CodePreviewPanel.vue`

**Step 1: 评估是否需要统一 workspace-inspector 接口**

- 仅在前端 `WorkspaceModel` 稳定后进行
- 避免过早冻结服务端聚合协议

**Step 2: 评估 Git Status 正式入 panel**

- 作为第 5 个工作区视角进入差异面板体系
- 明确与 diff 模式的语义边界

**Step 3: 评估基线分支可配置策略**

- 解决当前 `main -> master` 硬编码的局限

**Step 4: Commit**

```bash
git commit -m "docs: 补充工作区统一模型后续演进方向"
```

## 当前执行进度

- 已完成：Task 1、Task 2、Task 3、Task 4、Task 5
- 待继续评估：Task 6

当前实现已经完成统一工作区模型的前端收敛骨架，后续重点从“模型落地”转向“能力增强”，包括：

- `Git Status` 正式进入 panel
- `base branch` 可配置
- 是否引入 bridge 侧统一 `workspace-inspector` 接口
