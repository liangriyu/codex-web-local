# 工作区守卫一致性设计文档

## 背景与目标

当前项目已经支持受限版工作区分支切换与创建，但最近的两类问题暴露出同一个更深层的架构缺陷：

- 页面刷新后，历史审批状态无法稳定恢复成分支切换阻塞提示。
- 页面有时看不到未暂存或未提交变更，但分支切换仍然处于 `workspace_dirty` 阻塞状态。

这两个现象的共同根因不是单点 bug，而是“阻塞规则”和“用户可见证据”当前来自不同事实来源：

- 分支阻塞中的 `workspace_dirty` 依赖 `git status --porcelain`
- 工作区 diff 视图和统计依赖 `git diff --numstat`
- 审批阻塞依赖 bridge 实时内存中的 pending request
- 线程历史与 `thread/read` 又不包含可可靠恢复的审批生命周期

本设计文档的目标是：

- 统一工作区级阻塞规则与页面展示证据的数据来源。
- 为后续“刷新后仍阻塞”的审批能力提供可落地的持久化扩展点。
- 先收敛当前最明确的问题：`workspace_dirty` 有阻塞但页面无证据。

## 现状问题

### 1. 同一条业务规则由两套 Git 视角分别实现

当前桥接层里，工作区 dirty 的判定和工作区变更展示使用了两套不同命令：

- `readWorkspaceGitStatus()` 使用 `git status --porcelain`
- `collectWorkspaceChanges()` 使用 `git diff --numstat` 与 `git diff --cached --numstat`

这会带来天然不一致：

- `git status` 可识别未跟踪文件、冲突、重命名等状态
- `git diff --numstat` 主要覆盖可生成 patch 的 tracked 变更

结果就是：工作区确实是 dirty，但页面的“工作区变更”可能为空。

### 2. 审批阻塞依赖瞬时内存，不是持久语义

当前审批阻塞来自 `pendingServerRequestsByThreadId`，其来源是：

- 实时 `server/request` 事件
- 页面加载时 bridge 暴露的 pending request 接口

这套状态只在 bridge 当前运行时有效。刷新、重连、bridge 重启之后，如果上游没有继续提供 pending request，前端就失去阻塞依据。

### 3. 阻塞面保守，展示面贫血

当前系统已经选择了较保守的分支切换策略：

- 工作区脏则阻塞
- 同一 `cwd` 下有运行中线程则阻塞
- 有排队消息则阻塞
- 有待处理审批请求则阻塞

但 UI 只展示高度压缩后的字符串提示，不能把“为什么阻塞”对应到“具体是什么东西在阻塞”。

这会持续制造类似反馈：系统说不行，但用户看不到证据。

## 设计原则

### 1. 阻塞规则与展示证据必须共用同一事实来源

如果一个状态足以阻塞分支切换，那么页面必须能从同一份快照里解释它。

### 2. `git diff` 负责展示 patch，不负责判断是否 dirty

工作区是否有风险，不应再由 diff 结果反推，而应由结构化状态直接给出。

### 3. 审批持久化是“保守守卫”，不是“权威历史”

在当前 Codex app / app-server 真实数据模型下，审批生命周期不会可靠落入 `thread/read`。因此我们若补持久化账本，只能将其定义为：

- bridge 观察到的未闭合审批记录
- 用于保守阻塞
- 不应包装成上游权威状态

### 4. 优先修复确定性问题，再补连续性问题

`workspace_dirty` 的证据缺失是当前可稳定复现、且完全不依赖上游协议的问题，应先修复。

## 方案对比

### 方案 A：继续在现有字段上零碎补条件

做法：

- 保留 `isDirty` 布尔值
- 保留 `workspace-changes` 现有结构
- 前端继续通过不同状态源拼接阻塞原因

优点：

- 改动小

缺点：

- 不能解决根因
- 后续仍会反复出现“阻塞存在但证据缺席”
- 审批、dirty、排队消息之间仍然各说各话

不推荐。

### 方案 B：引入统一的“工作区守卫快照”（推荐）

做法：

- 在 bridge 层构建一个工作区级结构化快照
- 该快照统一包含 Git 脏状态明细、线程阻塞、排队消息阻塞、审批阻塞
- 分支菜单、状态层、工作区视图全部从这份快照派生

优点：

- 阻塞规则与 UI 证据统一
- 后续可以自然承接审批持久化
- 能显著降低后续继续叠加条件时的复杂度

缺点：

- 需要改 bridge 返回结构和前端状态层

推荐实施。

### 方案 C：把所有阻塞逻辑前移到前端

做法：

- bridge 继续返回零散接口
- 前端自行合并 `git/status`、`workspace-changes`、pending requests、线程状态

优点：

- bridge 改动小

缺点：

- 前端状态层会进一步膨胀
- 仍然没有统一的服务端事实来源
- 不利于多入口、多页面复用

不推荐。

## 设计结论

采用方案 B，引入统一的工作区守卫快照，并分阶段落地。

### 目标结构

```ts
type WorkspaceGuardSnapshot = {
  cwd: string
  isRepo: boolean
  currentBranch: string
  blockers: WorkspaceGuardBlockReason[]
  dirtySummary: {
    trackedModified: number
    staged: number
    untracked: number
    conflicted: number
    renamed: number
    deleted: number
  }
  dirtyEntries: Array<{
    path: string
    x: string
    y: string
    kind: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'unknown'
    staged: boolean
    unstaged: boolean
  }>
  livePendingRequestCount: number
  persistedUnresolvedRequestCount: number
}
```

说明：

- `blockers` 负责分支切换守卫
- `dirtyEntries` 负责让页面解释“为什么 dirty”
- `livePendingRequestCount` 与 `persistedUnresolvedRequestCount` 区分实时审批和持久化未闭合审批

## 分阶段实施

### 第一阶段：统一 Git 脏状态证据

只解决当前最确定的问题：

- `workspace_dirty` 为什么阻塞
- 页面为什么看不到对应变更

做法：

- bridge 新增结构化 Git 状态读取，解析 `git status --porcelain=v1 -uall`
- 工作区视图与分支菜单都从结构化状态读取摘要
- `workspace-changes` 继续保留，但职责收缩为 patch 展示，不再承担“是否 dirty”的语义

### 第二阶段：把线程/排队消息阻塞接入守卫快照

做法：

- 前端状态层继续维护实时线程执行态与排队消息
- 统一映射到守卫快照中的 blocker 展示逻辑

### 第三阶段：bridge 持久化审批记录

做法：

- bridge 观察 `server/request` 与 resolved 响应，记录本地账本
- 快照同时暴露：
  - `livePendingRequestCount`
  - `persistedUnresolvedRequestCount`

注意：

- 这份持久化账本只是“保守阻塞依据”
- 不是上游 app-server 的权威历史
- 必须预留清理陈旧记录的机制

## 风险与边界

### 1. 审批持久化可能产生“幽灵阻塞”

如果 bridge 记录了 request，但没有收到 resolved 事件，这条记录会长期保留。必须在后续阶段提供：

- TTL
- 手动忽略
- 或更明确的“检测到未闭合审批记录”文案

### 2. `git status` 与 patch 展示天然不等价

即便第一阶段完成，仍可能存在某些 dirty 状态没有可直接展示的 diff。解决方式不是强行生成 patch，而是：

- 在 UI 上诚实展示 dirty 类型
- 明确告诉用户是未跟踪文件、冲突、删除等哪一类状态阻塞了切分支

### 3. 工作区级语义仍然成立

守卫快照解决的是“解释一致性”，并不改变当前共享 `cwd` 架构。分支切换仍然是工作区级动作，不是线程私有能力。

## 验收标准

- 工作区因未跟踪文件或其他非 patch 型状态而 dirty 时，页面能够显示结构化原因，而不是空白。
- 分支菜单中的阻塞提示与工作区面板展示的证据来自同一份守卫快照。
- 后续接入审批持久化后，UI 能区分“实时待处理审批”和“历史未闭合审批记录”。
- 构建验证通过：`npm run build`

## 后续演进

- 第二阶段补 bridge 侧审批持久化账本
- 第三阶段评估是否将守卫快照扩展为更完整的工作区安全面板
- 长期若演进到 worktree 模型，守卫快照仍可作为每个工作副本的统一状态入口
