# 工作区守卫闭环与审批作用域收口设计

## 背景

当前分支已经完成：

- 工作区分支切换与创建
- 工作区守卫与结构化 Git 脏状态
- 审批未闭合记录持久化与单条忽略
- 多模式差异面板
- `Git Status` 一等视图
- `baseBranch` 按工作区配置与本地自动推导
- 统一 `WorkspaceModel`

从页面能力上看，这条主线已经接近完整。但在重新 review 当前分支后，暴露出两个比“还能再加什么功能”更关键的问题：

1. 分支切换保护仍主要停留在前端，后端接口可以直接绕过
2. `__global__` 审批请求会污染所有工作区的阻塞状态

这两个问题分别对应：

- 守卫边界不闭环
- 阻塞作用域不清晰

因此下一阶段不应继续补 UI，而应优先补“工作区守卫语义”的闭环。

## 目标

这一阶段拆成两个子任务：

- `Task 7A`: 服务端分支守卫闭环
- `Task 7B`: 全局审批作用域收口

## 问题 1：分支切换保护只在前端生效

当前前端会在状态层计算 `blockedReasons`，只有通过时才触发切分支。

但 bridge 侧的：

- `/codex-api/git/branch/switch`
- `/codex-api/git/branch/create-and-switch`

仅验证：

- `cwd`
- `branch`

随后就直接执行 `git switch` / `git switch -c`。

这意味着：

- UI 可以阻止用户点击
- 但任何直接调用后端 API 的请求仍然可以绕过 guard

这与“受限版工作区分支切换”的语义不一致。

## 问题 2：全局审批请求会阻塞所有工作区

当前状态层对 `__global__` 请求采用的是“全局污染”策略：

- live pending requests 只要出现在 `GLOBAL_SERVER_REQUEST_SCOPE`，所有工作区都视为被阻塞
- persisted unresolved requests 也会被直接并入每个工作区的 blocker 计算

这会导致两个问题：

1. 一个无法归属到具体线程/cwd 的审批请求，会让所有工作区都无法切分支
2. persisted records 会在多个工作区重复显示，语义上像“每个工作区都有这条请求”

这种设计过于保守，而且会让“工作区 blocker”和“会话 blocker”混淆。

## 方案对比

### 方案 A：继续维持前端守卫 + 全局审批全局阻塞

优点：

- 不用改

缺点：

- review 暴露的问题继续存在
- 系统边界不可信

不推荐。

### 方案 B：只补服务端 guard，不动审批作用域

优点：

- 直接堵住 API 绕过路径
- 风险收敛明显

缺点：

- 全局审批仍会继续污染所有工作区

适合作为最小止血方案，但不是本阶段最优方案。

### 方案 C：服务端 guard + 审批作用域收口（推荐）

做法：

- bridge 为分支切换接口加入服务端 guard
- 前端把 `__global__` 审批从 workspace blocker 中剥离，改为 session-level 提示或单独守卫

优点：

- 同时解决“绕过保护”和“误阻塞扩散”
- 仍然保持改动范围可控

缺点：

- 需要同时调整 bridge、state、文案

推荐采用。

## 设计结论

采用方案 C：

- `Task 7A`：服务端分支守卫闭环
- `Task 7B`：审批阻塞作用域从“工作区”与“全局会话”拆分

## Task 7A：服务端分支守卫闭环

### 目标

让以下两个接口在后端独立校验 guard，而不是仅依赖前端：

- `/codex-api/git/branch/switch`
- `/codex-api/git/branch/create-and-switch`

### 第一阶段服务端可判断的阻塞项

bridge 侧至少应能独立判断：

- `not_repo`
- `workspace_dirty`
- `pending_server_requests`
- `persisted_server_requests`

说明：

- `thread_in_progress`
- `queued_messages`

这两个目前主要存在于前端会话状态中，第一阶段可继续保留为前端 guard。

### 服务端 guard 输出模型

建议在 bridge 内部引入最小结构：

```ts
type ServerSideWorkspaceGuard = {
  cwd: string
  isRepo: boolean
  blockedReasons: Array<
    | 'not_repo'
    | 'workspace_dirty'
    | 'pending_server_requests'
    | 'persisted_server_requests'
  >
}
```

### 切分支接口行为

执行顺序调整为：

1. 读取服务端 guard
2. 若 `blockedReasons.length > 0`
   - 返回 `409` 或 `400`
   - 同时带出结构化 reason
3. 通过后再执行真实 `git switch`

这样至少能保证：

- dirty workspace 无法通过 API 绕过
- 审批阻塞无法通过 API 绕过

## Task 7B：全局审批作用域收口

### 目标

把审批阻塞拆成两层：

- `workspace-level blockers`
- `session-level global approvals`

### 新语义

#### 工作区阻塞

只包含明确归属于该 `cwd` 的审批：

- live pending request
- persisted unresolved request

#### 会话级提示/阻塞

单独承接：

- `GLOBAL_SERVER_REQUEST_SCOPE`

也就是当前无法归属到具体工作区的审批请求。

### 为什么不能继续把全局审批映射到所有工作区

因为这会制造语义错误：

- A 工作区被 B 工作区无关审批挡住
- persisted record 在每个工作区都重复出现
- 用户无法理解“为什么每个仓库里都显示同一条全局审批”

### 推荐状态模型

在前端状态层显式拆分：

```ts
type SessionApprovalState = {
  globalLive: UiServerRequest[]
  globalPersisted: UiPersistedServerRequest[]
}
```

工作区模型继续只持有：

```ts
type WorkspaceApprovalState = {
  live: UiServerRequest[]
  persisted: UiPersistedServerRequest[]
}
```

### UI 行为建议

#### 分支菜单

只展示当前工作区 blocker：

- workspace dirty
- workspace live approvals
- workspace persisted approvals

若存在全局审批：

- 额外显示一条轻提示
- 文案明确写成“当前会话存在全局审批请求”
- 不再把它当成“当前工作区的审批记录”

#### 后续增强

如果以后需要，再单独给全局审批做 session-level 面板或 banner。

## 数据流调整建议

### useDesktopState.ts

需要调整：

- `hasPendingServerRequestsInWorkspace()`
- `countLiveServerRequestsInWorkspace()`
- `listPersistedServerRequestsForWorkspace()`
- `listLiveServerRequestsForWorkspace()`

使其不再无条件吸收 `GLOBAL_SERVER_REQUEST_SCOPE`。

同时新增：

- `globalLiveServerRequests`
- `globalPersistedServerRequests`

### ThreadComposer.vue

分支菜单应继续显示工作区 blocker，但对全局审批仅展示轻提示，不再把它们混入当前工作区 persisted records 列表。

### codexAppServerBridge.ts

服务端 guard 只需要基于 bridge 自己已经持有的数据源判断：

- `pendingServerRequests`
- `persistedServerRequests`
- Git dirty state

无需依赖前端。

## 风险与边界

### 1. 前后端 guard 仍会暂时不完全一致

第一阶段后端还看不到：

- queued messages
- in-progress thread

但这比当前“完全可绕过”已经明显更安全。

### 2. 全局审批是否应阻塞所有工作区，本质是产品策略

当前推荐是“不再默认阻塞所有工作区”，但如果后续产品决定要保守到底，也应把它明确建模成 session guard，而不是继续伪装成 workspace guard。

### 3. persisted approvals 仍然不是上游权威状态

即使作用域收口后，它仍然只是本地守卫账本的一部分，需要在文案上继续保持诚实。

## 验收标准

满足以下条件视为完成：

1. 直接调用分支切换 API 也无法绕过 dirty / approval guard
2. `GLOBAL_SERVER_REQUEST_SCOPE` 不再默认把所有工作区都标记为审批阻塞
3. 分支菜单中的 persisted/live requests 只展示与当前工作区明确相关的记录
4. 若存在全局审批，页面会以 session-level 方式提示，而不是伪装成当前工作区 blocker

