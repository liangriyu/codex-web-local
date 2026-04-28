# Git Status 一等视图与 Base Branch 配置化设计

## 背景

当前分支已经完成：

- 多模式工作区差异面板
- 统一工作区模型 `WorkspaceModel`
- 工作区守卫、结构化 Git 脏状态、审批阻塞持久化

但距离“对标 Codex app 页面实现”仍有两个明显缺口：

1. `Git Status` 仍然不是右侧工作区面板中的一等视图，只以提示块或分支菜单摘要存在
2. `全部分支更改` 仍依赖 `main -> master` 的硬编码基线分支策略，不够产品化

这两个问题分别对应：

- 工作区可见性不足
- 分支差异语义不稳定

本设计把它们拆成同一阶段的两个子任务：

- `Task 6A`: `Git Status` 正式进入工作区面板
- `Task 6B`: `base branch` 配置化

## 目标

### Task 6A 目标

让 `Git Status` 成为右侧工作区面板中的第 5 个正式视角，与以下模式同级：

- `未暂存`
- `已暂存`
- `全部分支更改`
- `最近一次提交`
- `Git 状态`

### Task 6B 目标

让 `全部分支更改` 的基线分支不再长期停留在 `main -> master` 硬编码，而是具备：

- 自动推导
- 按工作区配置
- UI 可见

## 现状问题

### 1. Git Status 仍是旁路信息

当前结构化 Git 状态已经存在于：

- [src/server/codexAppServerBridge.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts)
- [src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts)
- [src/types/codex.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/types/codex.ts)

但展示层仍有两个问题：

- [src/App.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/App.vue) 里仍存在 `workspaceDirtyHiddenNotice`
- [src/components/content/ThreadComposer.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/ThreadComposer.vue) 里的分支菜单只展示摘要，不是正式状态视图

结果是用户仍然会问：

- 为什么我被 `workspace_dirty` 阻塞，但 diff 面板没看到？

这不是提示文案问题，而是产品结构问题。

### 2. Branch diff 的基线分支策略过于脆弱

当前 `branch` 模式在 [src/server/codexAppServerBridge.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts) 中按：

- `main`
- `master`

依次回退。

这在很多仓库中会出现三类问题：

- 默认基线其实是 `develop` / `dev`
- repo 使用 release 分支流
- 用户希望临时改成与某个 feature/base branch 对比

因此当前实现虽然可用，但语义并不可靠。

## 方案对比

### 方案 A：只做 Git Status tab，不做 base branch 配置

优点：

- 立即改善工作区可见性
- 实现相对集中

缺点：

- `全部分支更改` 仍会继续输出可能语义错误的结果

不推荐作为最终方案。

### 方案 B：Git Status tab + 轻量 base branch 配置（推荐）

做法：

- 把 `Git Status` 正式纳入差异面板
- 为 `WorkspaceModel.branch.baseBranch` 建立前端状态与本地持久化
- branch diff 请求支持可选 `baseBranch`

优点：

- 同时补足“看得见”和“比得对”
- 仍然保持范围可控

缺点：

- 需要同时修改 panel、state、bridge

推荐采用。

### 方案 C：直接做 bridge 统一 inspector 接口

优点：

- 长期架构最整齐

缺点：

- 当前阶段过重
- 会把增强任务膨胀成新一轮协议重构

当前不推荐。

## 设计结论

采用方案 B：

- `Git Status` 作为第 5 个正式视角进入工作区面板
- `baseBranch` 成为按 `cwd` 管理的前端状态，并可参与 branch diff 请求

## Task 6A：Git Status 正式入 panel

### 目标形态

工作区面板最终支持以下 5 个视角：

- `unstaged`
- `staged`
- `branch`
- `lastCommit`
- `gitStatus`

其中前 4 个仍然是 patch 视角，`gitStatus` 是状态视角。

### 为什么不把 Git Status 混成 diff

`gitStatus` 回答的问题是：

- 当前工作区有哪些状态？
- 哪些状态阻塞了分支切换？

它不等于：

- 这些状态都能形成 unified diff

因此应作为独立 tab，而不是把 untracked/conflicted/renamed 等状态强行混入 patch 列表。

### Git Status tab 内容

建议包含 3 个区块：

#### 1. 顶部摘要

- 当前分支
- 当前基线分支（如已配置）
- dirty summary
- blocker 摘要

#### 2. 状态列表

每条 `dirtyEntry` 展示：

- `path`
- `kind`
- `staged / unstaged`
- 必要时原始 `x/y` 标记

#### 3. 说明区域

- 当前状态为什么阻塞分支切换
- 后续若要支持 `stash`、提交候选集、延后处理集，这里也是自然入口

### 数据来源

直接消费 `WorkspaceModel.gitStatus` 与 `WorkspaceModel.guard`：

- `workspace.gitStatus.summary`
- `workspace.gitStatus.entries`
- `workspace.guard.blockedReasons`

不新增额外 Git status endpoint。

## Task 6B：Base Branch 配置化

### 目标形态

`WorkspaceModel.branch.baseBranch` 成为一等状态。

`branch` diff 模式的比较基线按以下顺序确定：

1. 用户为该 `cwd` 显式选择的 `baseBranch`
2. 自动推导的默认值
3. 若都失败，则返回 warning

### 自动推导策略

第一阶段建议采用保守顺序：

1. `main`
2. `master`
3. 本地默认分支候选（仅在能可靠解析时启用）

说明：

- 不在这一阶段引入远程网络探测
- 不尝试做复杂 fork-point 语义

### 前端配置策略

`baseBranch` 先按 `cwd` 存本地状态与本地存储：

- 状态层由 [src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts) 管理
- 本地持久化可扩展现有 `desktop-state/storage.ts`

第一阶段不要求 bridge 自己持久化。

### UI 入口

建议放在右侧工作区面板而不是分支菜单：

- 分支菜单已经承担切换/创建/阻塞解释
- `baseBranch` 更接近“branch diff 配置”
- 放在面板的 `branch` 视角顶部更符合语义

建议展示：

- 当前比较：`baseBranch -> HEAD`
- 一个轻量下拉，候选为本地现有分支

### bridge 侧改造

`/codex-api/workspace-diff-mode` 增加可选查询参数：

- `baseBranch=<branchName>`

在 `mode=branch` 时：

- 优先使用传入的 `baseBranch`
- 无效时返回 warning，并回退到自动推导
- 返回实际采用的 `baseRef`

## 数据模型调整

### `UiWorkspaceDiffMode`

扩展为：

```ts
type UiWorkspaceDiffMode =
  | 'unstaged'
  | 'staged'
  | 'branch'
  | 'lastCommit'
  | 'gitStatus'
```

### `WorkspaceModel.branch`

继续使用现有字段，并正式启用：

- `baseBranch: string | null`

### `WorkspaceModel.diff`

保持以 mode 为中心：

- `selectedMode`
- `snapshots`
- `isLoadingByMode`

`gitStatus` 模式不要求一定有 patch snapshot，但允许使用统一 mode 切换。

## 组件职责

### App.vue

- 只负责打开工作区面板
- 不重新解释 Git Status 语义
- 不自己计算 base branch

### useDesktopState.ts

- 维护 `WorkspaceModel.branch.baseBranch`
- 持久化每个 `cwd` 的 base branch
- 在切换 `branch` diff 模式时带上对应 base branch

### CodePreviewPanel.vue

- 增加 `gitStatus` tab
- 在 `branch` 模式显示当前 base branch
- 提供 base branch 切换入口

### codexAppServerBridge.ts

- `branch` diff 支持可选 `baseBranch`
- 返回实际使用的 `baseRef`

## 风险与边界

### 1. Git Status tab 容易继续膨胀

如果未来把 stash / commit / discard 都塞进去，它会迅速变成半个 Git 客户端。第一阶段应只做状态展示。

### 2. Base branch 配置不能假装“智能”

第一阶段的基线策略应明确而保守，不要在 UI 上暗示“系统一定知道正确基线”。

### 3. 本地存储的 base branch 只是前端偏好

它不是仓库配置，也不是团队共享设置。

## 结论

当前最合适的增强方向是：

1. 把 `Git Status` 提升为工作区面板的一等视角
2. 把 `baseBranch` 从硬编码升级为按工作区配置的比较基线

这两步做完后，当前项目在页面形态上会明显更接近 Codex app 的工作区 Inspector，而不会再次陷入“能做很多事，但每块信息都像旁路提示”的状态。

## 当前落地进度

截至当前实现，已经完成：

- [src/types/codex.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/types/codex.ts) 已将 `gitStatus` 纳入 `UiWorkspaceDiffMode`
- [src/composables/desktop-state/storage.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/desktop-state/storage.ts) 已支持按 `cwd` 持久化 `baseBranch`
- [src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts) 已在 `WorkspaceModel.branch` 中接入 `baseBranch`
- [src/server/codexAppServerBridge.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts) 已让 `workspace-diff-mode` 支持可选 `baseBranch`
- [src/components/content/CodePreviewPanel.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue) 已新增 `Git Status` 正式视图与 `branch` 视角下的基线分支选择器

后续仍可继续增强的部分主要是：

- 更强的 `baseBranch` 自动推导策略
- 将 `Git Status` 视角继续扩展为工作区处理入口
- 评估 bridge 侧统一 `workspace-inspector` 快照接口
