# web 与终端共享会话快照设计

## 背景

当前产品希望达成的目标不是“所有端都能实时接管同一条活连接”，而是：

- web 与终端对同一条会话的进展有一致认知
- Codex App 后续能够看到 web / 终端 的会话进展
- 用户知道当前由哪一端控制，以及应回哪一端继续处理

基于现有代码与协议边界，这个目标需要先拆成两层：

- 共享历史层：`thread/list`、`thread/read` 可读取的 rollout / thread 历史
- 连接态事件层：`server/request`、实时审批、进行中 turn 状态等仅属于当前客户端连接的事件

当前 web 之所以能读取到部分 Codex App 会话，是因为它通过自己启动的 `codex app-server` 调用 `thread/list` / `thread/read` 读取 recorded threads，而不是直接接管原生 Codex App 的实时连接。审批等实时 request 仍然只会进入当前连接持有者。

因此，如果产品目标是“在 Codex App 里也能看到 web / 终端 的会话进展”，合理的技术前置条件不是先接管原生 App，而是先让 web 与终端共享一份可读、可解释、可消费的会话快照。

## 目标

- 为 web 与终端 建立单一事实源层，使双方对会话进展的认知一致
- 让非控制端可以稳定读取会话进展，而不伪装成可控制端
- 为 Codex App 后续接入“历史镜像 / 进展镜像”提供稳定数据源
- 统一表达：
  - 当前会话是谁在控制
  - 当前是否运行中
  - 最近完成到哪一步
  - 是否有待处理风险需要回控制端处理

## 非目标

- 不承诺一期实现跨端实时审批
- 不承诺一期实现任意端无缝接管同一条活 turn
- 不尝试在本仓库内直接改造原生 Codex App
- 不把镜像线程伪装成“完全可控制线程”
- 不做 token 级逐字流式同步

## 现状与核心问题

### 1. 历史可共享，但实时连接态不可共享

现有架构里：

- web 通过 bridge 自己拉起 `codex app-server`
- 前端通过 `/codex-api/rpc` 调用 `thread/list`、`thread/read`
- `server/request` 等实时审批来自 bridge 当前连接的内存状态

结果是：

- 会话历史能跨端读取
- 实时审批、实时控制权、正在执行中的瞬时状态无法自然共享

### 2. 如果不先统一 web 与终端，Codex App 只能消费不一致结果

如果 web 与终端 仍各自维护自己的状态来源，那么 Codex App 后续无论消费哪一端，都会遇到：

- 权威来源不明确
- 同一条 thread 的当前状态不一致
- 审批、错误、运行中状态可能冲突
- 用户看到的是“更多信息”，但不是“更可信的信息”

### 3. 直接追求三端同控风险过高

要实现三端同控，至少需要：

- 统一 broker
- 统一 owner / lease 模型
- 统一审批和 interrupt 归属
- 原生 Codex App 存在外部接入点

当前这些条件并不成立，因此直接做“原生 App 实时同控”不应作为近期方案。

## 方案对比

### 方案 A：仅共享历史

做法：

- web 与终端 各自保持现有连接方式
- 只共享消息历史和完成后的 turn 结果
- 不共享控制权、运行态、审批摘要

优点：

- 最容易实现

缺点：

- 仍然无法回答“当前进展如何”
- 对 Codex App 的价值有限
- 用户仍会遇到“历史一致、当前不一致”

不推荐作为正式方案。

### 方案 B：共享会话快照，控制端单写，观察端只读（推荐）

做法：

- 增加一层 `shared session snapshot`
- 由当前控制端导出共享快照
- 其他端只读取快照，不写核心状态
- snapshot 统一表达消息时间线、运行态、attention 摘要和当前 owner

优点：

- 能满足“可见进展”的核心产品目标
- 不依赖原生 Codex App 暴露实时接入点
- 可作为后续 Codex App 镜像的稳定输入
- 风险与复杂度显著低于 broker

缺点：

- 仍不是多端同控
- 需要明确定义 owner 和 handoff 规则

推荐作为一期方案。

### 方案 C：web 与终端 全量 broker 化

做法：

- web 与终端 都不再直连 app-server
- 所有 turn、审批、interrupt、状态流都通过 broker 中转

优点：

- 架构最整洁
- 长期最接近真正多端同会话

缺点：

- 改造量大
- 需要先解决更多协议归属问题
- 不适合作为短期产品交付方案

建议作为远期演进方向，而非一期目标。

## 设计结论

采用方案 B：

- `shared session snapshot` 作为 web 与终端 的共享事实源
- `single writer, multi reader`
- `谁发起，谁控制`
- `非控制端只读共享快照`
- `Codex App 后续作为快照 reader 接入`

这个方案追求的是：

- 多端同见
- 控制权清晰
- attention 可解释

而不是：

- 多端同控
- 多端实时审批

## 核心模型

### SharedSessionSnapshot

```ts
type SharedSessionSnapshot = {
  sessionId: string
  sourceThreadId: string
  sourceConversationId: string | null

  title: string
  cwd: string | null

  owner: 'web' | 'terminal'
  ownerInstanceId: string | null
  ownerLeaseExpiresAtIso: string | null

  state: 'idle' | 'running' | 'needs_attention' | 'failed' | 'interrupted' | 'stale_owner'
  activeTurnId: string | null
  updatedAtIso: string

  timeline: SharedTimelineEntry[]

  latestTurnSummary: {
    turnId: string
    status: 'running' | 'completed' | 'failed' | 'interrupted'
    summary: string | null
    startedAtIso: string | null
    completedAtIso: string | null
  } | null

  attention: {
    pendingApprovalCount: number
    pendingApprovalKinds: Array<'command' | 'file_change' | 'other'>
    latestErrorMessage: string | null
    requiresReturnToOwner: boolean
  }

  capabilities: {
    canViewHistory: boolean
    canRequestTakeover: boolean
    canApproveInCurrentClient: boolean
  }
}
```

### SharedTimelineEntry

```ts
type SharedTimelineEntry =
  | {
      id: string
      kind: 'user_message'
      text: string
      createdAtIso: string
    }
  | {
      id: string
      kind: 'assistant_message'
      text: string
      createdAtIso: string
    }
  | {
      id: string
      kind: 'turn_summary'
      text: string
      createdAtIso: string
      turnId: string
      status: 'completed' | 'failed' | 'interrupted'
    }
  | {
      id: string
      kind: 'attention'
      text: string
      createdAtIso: string
      attentionKind: 'approval' | 'error'
    }
```

## 读写角色

### 1. 控制端 writer

- 当前真正发起 `thread/start` / `turn/start` 的客户端成为 owner
- owner 负责把会话投影成最新 snapshot
- owner 负责维护 lease / heartbeat

### 2. 非控制端 reader

- reader 只读取共享快照
- reader 不得覆盖 owner、state、attention 等核心字段
- Codex App 后续也只作为 reader 接入

### 3. owner 规则

一期采用保守规则：

- 谁发起，谁控制
- 非控制端默认不接管
- owner 超时后可显示 `stale_owner`
- 接管能力留待二期

## snapshot 产出链路

```text
app-server 原始事件 / thread/read
        ↓
控制端本地状态层
        ↓
snapshot projector
        ↓
共享 snapshot 存储
        ↓
web / terminal / Codex App reader
```

关键原则：

- projector 只产出“可共享事实”，不转发所有原始事件
- attention 只做摘要，不做伪审批能力
- 流式输出按分段刷新或完成态刷新，不逐 token 镜像

## 存储设计

### 推荐位置

一期采用文件型共享存储：

- 首选 `CODEX_HOME/shared-sessions/<sessionId>.json`
- 无 `CODEX_HOME` 时回退到用户 home 下 `.codex/shared-sessions/<sessionId>.json`

### 设计原因

- 与现有 bridge 本地账本思路一致
- 易于 web、终端 和未来 reader 共同访问
- 单机场景下部署成本最低
- 后续升级 broker 时可作为迁移来源

## 写入策略

### 立即写

- owner 变化
- state 变化
- attention 变化
- turn 完成 / 失败 / 中断

### 限频写

- heartbeat
- timeline 增量追加

### 不写的内容

- token 级 reasoning 中间文本
- 不稳定的瞬时 UI 状态
- 当前连接专属、无法跨端准确解释的细粒度事件

## reader 行为

reader 端只做两件事：

- 定期读取 snapshot
- 根据 owner 与 state 诚实渲染 UI

如果：

- owner 是自己：可显示“当前由本端控制”
- owner 是其他端：显示“当前由其他端控制，请回控制端继续”
- lease 已过期：显示“控制端状态可能已过期”

## attention 设计

attention 只表达“当前是否有需要用户关心的风险”，不伪装成可操作审批。

一期只统一以下摘要：

- 是否存在待处理审批
- 最近一次错误消息
- 是否需要回 owner 继续处理

这层输出可直接驱动：

- web 非控制视图
- terminal 非控制视图
- Codex App 镜像卡片

## 产品交互约束

### 必须强调的事实

- 当前控制端是谁
- 非控制端只能看，不负责真正审批
- 若存在待处理风险，需回控制端处理

### 明确不应该出现的体验

- 在镜像端展示可点击但实际无效的审批按钮
- 把镜像线程与真实控制线程做成完全同形态
- 在没有 owner 切换语义之前允许多端同时继续发消息

## 分阶段实施建议

### 一期：web writer + terminal reader + shared snapshot substrate

- web 作为第一个成熟 writer
- terminal 先消费共享 snapshot
- Codex App 后续亦消费同一份 snapshot

### 二期：terminal writer + owner 接管

- terminal 补齐 writer 能力
- 引入显式 `claim owner`
- 增加 stale owner 恢复流程

### 三期：Codex App 镜像接入

- App 展示共享 timeline、state、attention
- 提供“返回控制端继续”入口

### 远期：broker 评估

- 只有确认原生 App 存在外部接入能力后，再评估深度联动或 broker 方案

## 风险与边界

### 1. 伪控制风险

如果非控制端 UI 过于接近真实控制端，用户会误以为自己可以直接审批或继续对话，严重损伤信任。

### 2. 双 writer 风险

若一期允许 web 与终端 同时写核心快照，会快速引入 owner 争抢、attention 覆盖和状态回退问题。

### 3. 过度实时化风险

过早追求 token 级同步和完整中间态共享，会显著增加复杂度，但对“看见进展”的产品价值提升有限。

### 4. 仓库边界

本仓库目前只能直接落地：

- web writer
- snapshot 存储
- snapshot 协议
- reader contract

terminal writer 与原生 Codex App reader 需要通过对外契约接入，不应在本仓库内伪装成已完成。

## 验收标准

- 共享快照能够稳定表达：
  - 当前会话 id
  - 当前 owner
  - 当前 state
  - 最近消息与最近一轮摘要
  - 当前 attention 摘要
- 非控制端看到的 UI 不会误导为“可以直接审批或继续”
- web 作为 writer 时，reader 能在可接受时延内看见进展
- 设计与实现都明确区分“共享历史”与“连接态事件”

## 结论

如果产品目标是“在 Codex App 里也能看到 web / 终端 的会话进展”，最现实、最诚实、也最有扩展性的路径不是直接攻克原生 App 接入，而是：

- 先让 web 与终端 共享一份 `SharedSessionSnapshot`
- 明确 single writer / multi reader 的控制模型
- 让 Codex App 后续消费这份共享快照作为镜像输入

这样可以先把“进展可见”做真，再在未来决定“控制可共享”要不要继续深入。
