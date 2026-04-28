# 未闭合审批阻塞记录手动忽略设计文档

## 背景与目标

当前项目已经在 bridge 层持久化 `server/request`，并把未 resolved 的记录作为 `persisted_server_requests` 纳入工作区守卫模型。这样做解决了刷新页面或 bridge 重启后“审批阻塞消失”的连续性问题，但也带来了一个新的产品边界：

- 这份账本并不是 Codex app-server 的权威状态。
- 它只代表 bridge 曾经观察到一个需要人工处理的审批请求。
- 如果 resolved 事件丢失、bridge 异常退出，或者上游 request 已经在别处失效，这类记录可能继续保留并阻塞分支切换。

因此，系统需要一个用户可控的出口，让用户在确认某条未闭合审批记录只是“本地阻塞残留”时，可以解除它对分支切换的影响。

本设计文档的目标是：

- 为 `persisted_server_requests` 增加“手动忽略阻塞记录”的能力。
- 保持实时审批与历史阻塞记录的语义清晰分离。
- 保留本地账本的可追溯性，不通过物理删除掩盖历史。

## 现状问题

### 1. 当前 persisted approvals 只能自动过期，不能人工解除

目前未闭合审批记录的出路只有两种：

- 收到 resolved 信号，被自动标记完成
- 超过 TTL，被后台清理

这意味着如果用户遇到误阻塞或残留阻塞，只能等待 TTL，而不能立即恢复分支切换能力。

### 2. persisted approvals 不是实时审批，不能沿用现有处理动作

实时 `pending_server_requests` 仍然可以在对话区执行：

- 接受
- 拒绝
- 提交答案
- 取消

但 `persisted_server_requests` 本质上只是本地账本里的未闭合记录。它不保证还能重新回到 app-server 去执行这些动作，因此不能伪装成“还能继续审批”的实时卡片。

### 3. 直接删除账本记录会破坏可追溯性

如果把“忽略阻塞”实现成“物理删除 JSON 账本里的记录”，会带来两个问题：

- 用户无法回看为什么之前被阻塞
- 后续无法区分“真的 resolved”与“用户手动忽略”

这会让账本失去“保守守卫”所需的最低可解释性。

## 设计原则

### 1. 忽略的是“本地阻塞影响”，不是“审批本身”

UI 文案和接口语义都必须明确这一点：

- 不是关闭审批
- 不是完成审批
- 不是替代 accept / decline
- 只是忽略本地未闭合审批记录对分支切换的阻塞

### 2. 只允许忽略 persisted 记录，不允许忽略 live pending request

实时待处理审批仍然属于当前执行流程的一部分，应继续要求用户回到对话区处理，而不是从分支菜单里绕过。

### 3. 使用软忽略，不做物理删除

记录仍保留在账本中，只是在后续“未闭合阻塞记录查询”里默认排除。

### 4. 第一阶段只支持单条忽略

批量按工作区忽略虽然操作更快，但误伤范围更大。第一阶段优先做最小可控单元，降低误操作风险。

## 方案对比

### 方案 A：物理删除账本记录

做法：

- 新增接口，按 request id 直接从 ledger 中删除记录

优点：

- 实现最简单
- 前端调用成本低

缺点：

- 审计信息丢失
- 无法区分“resolved”和“人为忽略”
- 以后若要恢复或排查，缺少依据

不推荐。

### 方案 B：软忽略 persisted 记录（推荐）

做法：

- 在持久化记录上增加 `dismissedAtIso`、`dismissedReason`、`dismissedBy`
- 阻塞查询默认只返回：
  - `resolvedAtIso === null`
  - `dismissedAtIso === null`

优点：

- 保留账本可追溯性
- 语义最清晰
- 以后可自然扩展“恢复忽略记录”

缺点：

- 比删除多一层字段和过滤逻辑

推荐实施。

### 方案 C：前端 localStorage 忽略列表

做法：

- 前端单独维护一个“已忽略 request id”列表
- 分支菜单阻塞判断时本地排除

优点：

- 后端改动最小

缺点：

- 换浏览器、换设备、清缓存即失效
- 与 bridge 账本状态分裂
- 不能服务多标签或重连场景

不推荐。

## 设计结论

采用方案 B：为 persisted approvals 增加软忽略能力，并把它纳入现有工作区守卫模型。

## 目标结构

### 持久化记录扩展

```ts
type PersistedServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  cwd: string
  params: unknown
  receivedAtIso: string
  resolvedAtIso: string | null
  resolutionKind: string | null
  dismissedAtIso: string | null
  dismissedReason: string | null
  dismissedBy: 'user' | null
}
```

说明：

- `resolvedAtIso !== null` 表示真正结束
- `dismissedAtIso !== null` 表示仍未 resolved，但用户决定忽略其阻塞影响

### UI 类型扩展

前端 `UiPersistedServerRequest` 需要镜像增加：

- `dismissedAtIso`
- `dismissedReason`
- `dismissedBy`

同时增加一个专用动作：

- `dismissPersistedServerRequests(ids: number[])`

## 交互设计

### 入口位置

第一阶段入口放在分支菜单中，而不是对话区。

原因：

- 问题触发点就在分支切换阻塞
- persisted approvals 不是实时审批对象
- 放在对话区容易被误读成“还能直接审批”

### 展示规则

当 `blockedReasons` 包含 `persisted_server_requests` 时：

- 在分支菜单提示区展示“未闭合审批记录”
- 列出当前工作区相关的前 3 条记录：
  - method
  - receivedAtIso 的相对或紧凑时间
  - 可选 thread 标识
- 每条记录旁提供一个“忽略此阻塞记录”按钮

### 操作规则

- 仅允许忽略 `persisted_server_requests`
- 不允许忽略 `pending_server_requests`
- 单条忽略执行后：
  - 若该工作区仍有其他 persisted 记录，继续阻塞
  - 若只剩 live pending request，仍继续阻塞
  - 只有全部 blocker 条件清空后，分支切换才放开

### 确认机制

第一阶段建议保留轻确认：

- 点击忽略后弹一次原生 `confirm`
- 文案强调“这只会忽略本地阻塞记录，不会处理实时审批”

## 后端设计

### 新增接口

- `POST /codex-api/server-requests/persisted/dismiss`

请求体：

```json
{
  "requestIds": [123]
}
```

行为：

- 加载 ledger
- 对命中的 unresolved persisted record 写入：
  - `dismissedAtIso`
  - `dismissedReason = "user_ignored_branch_block"`
  - `dismissedBy = "user"`
- 已 resolved 或已 dismissed 的记录跳过
- 返回当前被 dismiss 的 request id 列表

### 列表读取规则

现有 `GET /codex-api/server-requests/persisted` 默认只返回：

- `resolvedAtIso === null`
- `dismissedAtIso === null`

这样前端继续拿到“有效阻塞记录”集合，不需要额外做 dismissed 过滤。

## 前端状态设计

### API 层

- 在 `codexRpcClient.ts` 增加 dismiss persisted requests 的 POST 调用
- 在 `codexGateway.ts` 增加高层封装

### 状态层

- `useDesktopState.ts` 新增 dismiss 动作
- 成功后立即从 `persistedServerRequestsByThreadId` 本地状态中移除对应 request id
- 同步刷新 `blockedReasons`
- 接口失败时不修改本地状态，并向 UI 返回错误

## 风险与边界

### 1. 用户可能忽略了真实仍需关注的记录

这是方案固有风险。因此第一阶段必须：

- 明确“只忽略阻塞影响”的文案
- 不允许忽略 live pending request

### 2. 工作区聚合仍受 threadId -> cwd 映射质量影响

当前 persisted approvals 多数仍依赖前端通过 threadId 映射 cwd。单条忽略不会加剧这个问题，但也不会消除它。

### 3. 忽略后不代表可恢复审批

本设计只处理守卫层，不尝试恢复历史审批操作，也不在对话区生成新卡片。

## 分阶段实施

### 第一阶段

- 扩展 ledger 结构，支持 dismissed 字段
- 新增单条 dismiss 接口
- 分支菜单列出工作区相关 persisted 记录并支持单条忽略

### 第二阶段

- 视需要增加“恢复已忽略记录”
- 或增加“查看已忽略记录”能力

### 第三阶段

- 评估是否支持按工作区批量忽略
- 仅在确认真实需求后再做，避免过早引入高风险快捷操作

## 成功标准

- persisted unresolved records 可被单条忽略
- 忽略后该记录不再阻塞分支切换
- live pending request 的处理语义不受影响
- UI 文案始终明确“忽略的是本地阻塞记录”

## 实施结果摘要

- 已按设计采用“软忽略”而非物理删除：ledger 记录新增 `dismissedAtIso`、`dismissedReason`、`dismissedBy`。
- 已新增 bridge dismiss 接口，并保持 `/codex-api/server-requests/persisted` 仅返回当前仍有效的阻塞记录。
- 分支菜单已展示当前工作区前 3 条 persisted 记录，并提供单条“忽略阻塞”入口。
- 错误反馈采用 `App.vue` 中的全局错误提示，不额外引入新的弹层或对话区卡片。
