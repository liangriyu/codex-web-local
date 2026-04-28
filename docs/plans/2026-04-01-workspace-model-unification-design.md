# 统一工作区模型设计

## 背景

当前分支已经陆续实现了以下能力：

- 工作区分支切换与创建
- 统一工作区守卫与结构化 Git 脏状态
- 审批未闭合记录持久化与单条忽略
- 多模式工作区差异面板

这些能力已经形成了“工作区操作台”的雏形，但同一份工作区真相仍然分散在多个文件中：

- [src/server/codexAppServerBridge.ts](../../src/server/codexAppServerBridge.ts)
- [src/composables/useDesktopState.ts](../../src/composables/useDesktopState.ts)
- [src/App.vue](../../src/App.vue)
- [src/components/content/CodePreviewPanel.vue](../../src/components/content/CodePreviewPanel.vue)
- [src/components/content/ThreadComposer.vue](../../src/components/content/ThreadComposer.vue)

结果是：

- 分支菜单、阻塞提示、差异面板、Git 状态提示各自持有半套工作区语义
- 入口统计与面板视角并不完全一致
- 新增能力时需要同时修改 bridge、state、App、panel 多层逻辑
- “工作区是什么”缺少单一、可复用、可缓存的对象模型

本设计的目标不是做一次大重构，而是定义一个统一的 `WorkspaceModel`，让后续能力围绕该模型渐进收敛。

## 设计目标

### 目标

- 一个 `cwd` 在前端只对应一个明确的工作区对象
- 分支、阻塞、Git 状态、差异快照、审批摘要都挂在同一个工作区对象下
- 页面层和组件层只消费工作区对象，不再自行重新拼装工作区真相
- 允许渐进迁移，不要求一步替换现有所有接口和组件

### 非目标

- 本阶段不直接改造为 worktree 架构
- 本阶段不重写所有 bridge endpoint
- 本阶段不引入新的 Git 写操作，例如 stash、commit、discard
- 本阶段不改变现有分支守卫规则和审批账本语义

## 当前分散模型

### 服务端事实层

[src/server/codexAppServerBridge.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts) 当前同时负责：

- 读取 Git 分支状态
- 读取结构化脏状态
- 读取多模式差异快照
- 维护 persisted approvals 账本

这些事实是可信的，但仍以零散 endpoint 暴露。

### 前端状态层

[src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts) 当前继续承担：

- blocker 聚合
- branch state 缓存
- approvals 聚合
- 与 `cwd` 相关的多种刷新逻辑

状态层已经在做“工作区 store”的事，但没有一个明确的一等对象作为宿主。

### 页面编排层

[src/App.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/App.vue) 当前还持有多处工作区语义：

- 打开工作区差异面板时默认先尝试 `unstaged` 再回退 `staged`
- 维护工作区 diff totals 的旧语义刷新
- 决定何时展示“工作区仍有未直接显示在 diff 中的 Git 状态”提示

这些逻辑不属于纯编排层，后续会继续放大页面复杂度。

### 展示层

[src/components/content/CodePreviewPanel.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue) 当前已经承载：

- 差异模式切换
- 模式说明
- ref 展示
- warning/empty state 解释

组件已经接近工作区面板，但其输入仍然不是统一的工作区对象，而是局部 snapshot。

## 目标统一模型

建议引入前端一等对象 `WorkspaceModel`：

```ts
type WorkspaceModel = {
  cwd: string

  branch: {
    isRepo: boolean
    currentBranch: string
    branches: string[]
    baseBranch: string | null
    isDetachedHead: boolean
    isLoading: boolean
    isSwitching: boolean
  }

  guard: {
    blockedReasons: WorkspaceBlockedReason[]
    livePendingRequestCount: number
    persistedPendingRequestCount: number
    queuedMessageCount: number
    inProgressThreadCount: number
  }

  gitStatus: {
    isDirty: boolean
    summary: UiWorkspaceDirtySummary | null
    entries: UiWorkspaceDirtyEntry[]
    fetchedAt: string | null
  }

  diff: {
    selectedMode: UiWorkspaceDiffMode
    snapshots: Partial<Record<UiWorkspaceDiffMode, UiWorkspaceDiffSnapshot>>
    isLoadingByMode: Partial<Record<UiWorkspaceDiffMode, boolean>>
  }

  approvals: {
    live: UiServerRequestSummary[]
    persisted: UiPersistedServerRequest[]
  }

  ui: {
    selectedPath: string | null
    expandedPaths: string[]
    lastOpenedAt: string | null
  }
}
```

### 设计原则

- 一个 `cwd` 对应一个 `WorkspaceModel`
- `WorkspaceModel` 是前端消费工作区信息的唯一入口
- `branch` 负责仓库上下文，不承载阻塞语义
- `guard` 只回答“为什么被阻塞”
- `gitStatus` 只回答“当前有哪些 Git 状态”
- `diff` 只回答“当前差异视角显示什么”
- `approvals` 继续区分 `live` 和 `persisted`
- `ui` 明确为前端展示态，避免和事实层混淆

## 四层职责收敛

### 1. Bridge 变成事实提供者

[src/server/codexAppServerBridge.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts) 的职责应收敛为：

- 提供 Git / app-server 原始事实
- 或提供可稳定组合成 `WorkspaceModel` 的聚合快照

Bridge 不再承担前端特定的展示语义。

### 2. useDesktopState 变成工作区 store

[src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts) 需要演进为：

- `workspaceByCwd: Record<string, WorkspaceModel>`
- 统一负责按 `cwd` 刷新和缓存工作区对象
- 对外暴露 `selectedWorkspaceModel`
- 接收 UI 动作，例如切换 diff mode、刷新 git status、dismiss persisted approval

状态层不再分散维护多套工作区局部状态。

### 3. App.vue 回归页面编排

[src/App.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/App.vue) 应回归为：

- 选择当前展示的线程或工作区
- 打开/关闭右侧预览
- 把 `selectedWorkspaceModel` 传给子组件

像“默认打开哪个 mode”“入口 totals 用哪个语义”等工作区规则，都应迁移到 workspace store。

### 4. CodePreviewPanel.vue 回归纯展示

[src/components/content/CodePreviewPanel.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue) 应基于 `WorkspaceModel` 渲染：

- 多模式差异面板
- 未来的 `Git Status` tab
- ref / warning / empty state
- 未来与工作区相关的更多只读信息

面板不再承担工作区语义推导职责。

## 渐进迁移策略

### 阶段 1：先统一前端模型，不动 bridge 事实接口

- 在 [src/types/codex.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/types/codex.ts) 定义 `WorkspaceModel`
- 在 [src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts) 建立 `workspaceByCwd`
- 将现有 branch、guard、gitStatus、diff、approvals 状态逐步写回到 `WorkspaceModel`

这是最小风险、收益最高的一步。

### 阶段 2：下沉 App.vue 的工作区规则

- 把默认 diff mode 选择逻辑从 [src/App.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/App.vue) 下沉到 workspace store
- 把工作区入口 totals 语义统一到 `WorkspaceModel`
- 让 App 只消费 `selectedWorkspaceModel`

### 阶段 3：让面板完全消费 WorkspaceModel

- 调整 [src/components/content/CodePreviewPanel.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue) 直接接收 `WorkspaceModel`
- 逐步补齐 `Git Status` 正式视图
- 未来所有工作区只读展示都从同一个对象渲染

### 阶段 4：评估 bridge 统一快照接口

- 仅在前端模型稳定后，再评估是否增加统一 `workspace-inspector` endpoint
- 避免在前端模型仍然摇摆时过早冻结服务端协议

## 预期收益

- 工作区语义有单一入口，减少前后端多处拼接
- 分支菜单、阻塞提示、差异面板、Git 状态可以共用一份工作区真相
- 后续加入 `Git Status` tab、base branch 配置、stash、提交候选集等能力时，不必继续横跨多层补丁式修改
- `App.vue`、`useDesktopState.ts`、`CodePreviewPanel.vue` 的职责更清晰，可维护性更好

## 风险与边界

- 这是一轮模型收敛，不是纯功能补充，容易牵动较多调用路径
- 若一次性替换过多状态字段，回归风险会明显升高
- Bridge 是否提供统一快照接口，应在前端模型稳定后再决定
- `WorkspaceModel` 不应过早吞下所有工作区行为，避免变成新的“巨型对象”

## 结论

当前分支的工作区能力已经足以支撑“统一工作区模型”这一步，但最合理的推进方式是：

1. 先在前端定义一等 `WorkspaceModel`
2. 再把分散在页面、状态、面板中的工作区规则逐步下沉和收口
3. 最后再视需要收敛 bridge 端接口

这能在不打断现有功能的前提下，把当前 PR 从“功能集合”继续演进成“统一工作区子系统”。

## 当前落地进度

截至当前分支最新实现，已完成以下收敛动作：

- [src/types/codex.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/types/codex.ts) 已定义 `WorkspaceModel` 及其子结构
- [src/composables/useDesktopState.ts](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts) 已建立 `workspaceByCwd`、`selectedWorkspaceModel`
- [src/App.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/App.vue) 已下沉工作区 diff mode 与 totals 逻辑，转为消费 workspace store
- [src/components/content/CodePreviewPanel.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue) 已改为围绕 `WorkspaceModel.diff` 渲染
- [src/components/content/ThreadComposer.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/ThreadComposer.vue) 已优先从 `WorkspaceModel` 读取分支、阻塞和 persisted approvals

当前仍保留少量兼容层字段，主要用于平滑迁移旧组件输入，后续可继续清理。
