# Workspace Guard Phase 2 Persisted Approvals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为工作区守卫模型补充“审批未闭合记录持久化”，使刷新页面或 bridge 重启后，分支切换仍能基于本地账本保守阻塞，并向 UI 明确区分实时审批与历史未闭合审批记录。

**Architecture:** 在 bridge 层为 `server/request` 与 `server/request/resolved` 增加本地持久化账本，账本按 request id 记录 threadId、cwd、method、receivedAtIso、resolvedAtIso 等字段，并通过新的只读接口暴露“未闭合审批记录”。前端状态层继续保留实时 pending request，用持久化未闭合记录作为第二条阻塞来源，并在菜单文案中与实时审批区分。为避免引入额外基础设施，本阶段使用 JSON 文件落盘，优先使用 `CODEX_HOME`，无该环境变量时回退到用户 home 目录下的 `.codex/codex-web-local`。

**Tech Stack:** Vue 3、TypeScript、Express middleware、Node `fs/promises`、Git CLI、Codex app-server JSON-RPC

---

### Task 1: 定义持久化审批类型

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 补充 UI 类型**

- 新增持久化审批记录类型。
- 区分实时 pending request 与持久化 unresolved request。

**Step 2: 保持兼容**

- 不修改现有 `UiServerRequest` 的实时交互语义。

### Task 2: 在 bridge 层实现持久化账本

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 增加账本存储结构**

- 定义持久化记录格式。
- 定义账本文件路径解析逻辑。

**Step 2: 在请求生命周期中落盘**

- 收到 `server/request` 时 upsert 记录。
- `respondToServerRequest()` 成功时标记 resolved。
- `server/request/resolved` 通知也作为 resolved 信号。

**Step 3: 提供读取接口**

- 新增 `GET /codex-api/server-requests/persisted`
- 仅返回 unresolved 记录，或返回全量并由前端过滤 unresolved

**Step 4: 保守错误处理**

- 账本写入失败时不影响实时请求处理
- 但应保留日志或错误信息，避免静默吞错过深

### Task 3: 接入前端 API

**Files:**
- Modify: `src/api/codexGateway.ts`

**Step 1: 新增 persisted requests 读取函数**

- 解析 bridge 返回的未闭合审批记录。

**Step 2: 安全降级**

- 接口失败时返回空数组，不影响实时审批 UI

### Task 4: 在状态层引入第二条阻塞来源

**Files:**
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 增加 persisted unresolved requests 状态**

- 按 threadId 保存记录
- 允许按 cwd 聚合判断

**Step 2: 接入刷新时机**

- 页面初始化时加载
- 线程列表刷新后同步裁剪无效 threadId
- server request 生命周期变化后同步刷新

**Step 3: 修改工作区阻塞判断**

- 实时 pending request 存在时继续阻塞
- persisted unresolved request 存在时也阻塞

### Task 5: 在 UI 中区分两类审批阻塞

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 细化阻塞文案**

- 区分：
  - 实时待处理审批
  - 历史未闭合审批记录

**Step 2: 保持交互边界清晰**

- 持久化未闭合审批只作为只读阻塞证据
- 不伪装成可直接响应的实时审批卡片

### Task 6: 文档收尾与验证

**Files:**
- Modify: `docs/plans/2026-04-01-workspace-guard-phase2-persisted-approvals-plan.md`

**Step 1: 运行构建验证**

Run: `npm run build`
Expected: PASS

**Step 2: 补充执行结果**

- 记录实际完成项、偏差、验证结果、后续待办

### 风险与回滚

- 风险：resolved 事件缺失会产生陈旧未闭合审批记录。
- 风险：同一 request 如果 threadId/cwd 缺失，账本聚合可能退化为全局阻塞。
- 回滚：移除 persisted approvals 接口与状态层逻辑，恢复只依赖实时 pending request 的阻塞模式。

### 验收与验证命令

- 刷新页面后，若存在本地账本中的未闭合审批记录，分支切换仍被阻塞。
- UI 能区分“实时待处理审批”和“历史未闭合审批记录”。
- 实时审批交互能力不回退。
- 验证命令：`npm run build`

## 执行结果

### 实际完成项

- 已在 bridge 层新增本地持久化审批账本，并通过 `server/request` / `respondToServerRequest()` 生命周期更新未闭合记录。
- 已新增 `GET /codex-api/server-requests/persisted` 接口，返回当前 unresolved 的审批记录。
- 已在前端 API 层补充 persisted requests 的读取与类型归一化。
- 已在状态层引入 persisted unresolved requests，并将其作为分支切换阻塞的第二条来源。
- 已在分支菜单阻塞文案中区分“实时待处理审批请求”和“未闭合审批记录”。
- 已在 bridge 账本中加入自动 TTL 清理：未闭合记录保留 7 天，已 resolved 记录保留 1 天。

### 实际偏差

- 当前账本优先记录 `threadId`、`turnId`、`itemId`，`cwd` 仅在请求参数显式包含时才写入；多数情况下仍依赖前端通过 `threadId -> cwd` 映射聚合工作区。
- 当前阶段只做“保守阻塞”，没有把 persisted unresolved requests 渲染成新的只读审批卡片。
- 当前阶段未加入 TTL、手动忽略或自动 reconcile 机制，因此极端情况下仍可能出现陈旧未闭合审批记录。

### 验证结果

- 2026-04-01：执行 `npm run build` 通过。

### 后续待办

- 如需更强可控性，可继续增加“手动忽略/清理未闭合审批记录”的入口。
- 评估是否在工作区守卫提示区补充“历史未闭合审批记录”的只读说明，而不只是分支菜单文案。
- 如后续需要更高置信度的工作区聚合，可考虑在 bridge 层为 `threadId -> cwd` 提供更直接的解析或缓存。
