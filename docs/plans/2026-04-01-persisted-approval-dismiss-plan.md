# Persisted Approval Dismiss Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 persisted unresolved approvals 增加“单条软忽略”入口，让用户可以解除本地未闭合审批记录对分支切换的阻塞，同时保持实时审批语义与账本可追溯性。

**Architecture:** 在 bridge 的 persisted approvals ledger 上增加 `dismissedAtIso`、`dismissedReason`、`dismissedBy` 字段，并新增单条 dismiss 接口。`GET /codex-api/server-requests/persisted` 继续只返回当前有效阻塞记录。前端在分支菜单里展示当前工作区相关的 persisted records，并提供逐条忽略入口；状态层在忽略成功后立即移除本地阻塞记录并重算 blocker。整个方案不改变 live pending request 的审批流程，也不把 persisted records 渲染成新的实时审批卡片。

**Tech Stack:** Vue 3、TypeScript、Express-style HTTP bridge、Node `fs/promises`、Codex app-server JSON-RPC

---

### Task 1: 扩展 persisted approvals 数据结构

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 扩展 bridge 持久化类型**

- 在 `PersistedServerRequest` 上新增：
  - `dismissedAtIso: string | null`
  - `dismissedReason: string | null`
  - `dismissedBy: 'user' | null`
- 加载旧 ledger 时兼容缺失字段。

**Step 2: 扩展前端镜像类型**

- `UiPersistedServerRequest` 增加对应字段。
- 保持旧数据缺失字段时的安全默认值。

**Step 3: 保持列表读取兼容**

- `GET /codex-api/server-requests/persisted` 默认过滤掉已 dismissed 记录。

### Task 2: 在 bridge 层实现 dismiss 接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 增加 dismiss 方法**

- 新增内部方法，按 request id 将 unresolved persisted record 标记为 dismissed。
- 对已 resolved、已 dismissed、找不到的记录安全跳过。

**Step 2: 新增 HTTP 接口**

- 增加 `POST /codex-api/server-requests/persisted/dismiss`
- 请求体格式：

```json
{
  "requestIds": [123]
}
```

- 返回成功 dismiss 的 request id 列表。

**Step 3: 账本刷盘与 TTL 保持兼容**

- dismiss 后继续沿用现有 flush 与 prune 逻辑。
- 不引入新的后台任务。

### Task 3: 接入前端 API

**Files:**
- Modify: `src/api/codexRpcClient.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 新增底层 RPC/HTTP 调用**

- 增加 dismiss persisted requests 的 POST 封装。

**Step 2: 新增高层 gateway 方法**

- 统一校验入参为整数数组。
- 出错时抛出已有 API 错误类型或回落默认错误处理。

### Task 4: 在状态层增加 dismiss 动作

**Files:**
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 增加当前工作区 persisted records 的筛选能力**

- 基于现有 `persistedServerRequestsByThreadId` 和 `threadId -> cwd` 关系，导出当前工作区相关记录。

**Step 2: 增加 dismiss 动作**

- 新增 `dismissPersistedServerRequests(requestIds: number[])`
- 调用成功后本地移除对应 request id
- 调用失败后保留当前状态

**Step 3: 保持 blocker 同步**

- dismiss 成功后立即重算 `blockedReasons`
- 仅 persisted blocker 允许解除，其他 blocker 不受影响

### Task 5: 在分支菜单中提供单条忽略入口

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`
- Modify: `src/App.vue`

**Step 1: 设计最小入口**

- 当存在 `persisted_server_requests` blocker 时，在分支菜单里列出当前工作区前 3 条记录。
- 每条记录展示：
  - method
  - 接收时间
  - 忽略按钮

**Step 2: 增加轻确认**

- 使用原生 `confirm` 或现有最轻确认方式。
- 文案明确说明“只忽略本地阻塞记录，不会处理实时审批”。

**Step 3: 错误反馈**

- 若 dismiss 失败，在菜单或顶部状态区显示简短错误提示。

### Task 6: 文档与验证

**Files:**
- Modify: `docs/plans/2026-04-01-persisted-approval-dismiss-design.md`
- Modify: `docs/plans/2026-04-01-persisted-approval-dismiss-plan.md`

**Step 1: 构建验证**

Run: `npm run build`
Expected: PASS

**Step 2: 手动场景验证**

- 准备一条 persisted unresolved request
- 打开分支菜单，确认出现单条忽略入口
- 忽略后 persisted blocker 消失
- 若仍有 `workspace_dirty` / `pending_server_requests`，仍继续阻塞

**Step 3: 回填执行结果**

- 在计划文档尾部记录实际完成项、偏差、验证结果、后续待办

### 风险与回滚

- 风险：用户可能误把 persisted 记录当成实时审批，因此文案必须强调“忽略阻塞影响”。
- 风险：当前 cwd 聚合仍依赖 threadId 映射，极端情况下单条记录的工作区归属可能不完美。
- 回滚：移除 dismiss 接口、前端入口和 dismissed 字段过滤，恢复仅靠 TTL 清理 persisted approvals。

### 验收与验证命令

- persisted unresolved request 可在分支菜单中单条忽略。
- 忽略后该记录不再参与 `persisted_server_requests` 阻塞。
- 实时 pending request 的审批流程无回退。
- 验证命令：`npm run build`

## 执行结果

### 实际完成项

- 已为 bridge 持久化审批 ledger 增加 `dismissedAtIso`、`dismissedReason`、`dismissedBy` 字段，并兼容旧账本读取。
- 已新增 `POST /codex-api/server-requests/persisted/dismiss` 接口，支持按 request id 单条软忽略。
- 已在前端 API 层增加 dismiss persisted requests 的调用封装与类型归一化。
- 已在 `useDesktopState.ts` 中增加当前工作区 persisted records 聚合与 dismiss 动作，忽略成功后立即移除本地阻塞记录并重算 blocker。
- 已在 `ThreadComposer.vue` 的分支菜单中增加 persisted records 列表和单条“忽略阻塞”按钮，并加上原生确认。
- 已在 `App.vue` 中补全全局错误提示，使 dismiss 失败时有可见反馈。

### 实际偏差

- 计划中的“菜单内或顶部状态区显示错误”最终采用了 `App.vue` 现有页面级错误提示，没有在分支菜单内再单独放一条错误消息。
- 当前只展示前 3 条当前工作区相关的 persisted records，未提供展开更多或恢复已忽略记录的入口。

### 验证结果

- 2026-04-01：执行 `npm run build` 通过。

### 后续待办

- 视实际使用情况再评估是否需要“恢复已忽略记录”能力。
- 若 persisted records 数量较多，可考虑增加“查看更多”或“按工作区批量忽略”的后续方案，但不应在当前阶段过早加入。
