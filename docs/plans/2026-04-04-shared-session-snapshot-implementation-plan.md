# Shared Session Snapshot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在本仓库内落地 web 侧共享会话快照基础设施，使 web 能导出单写多读的会话快照，并为 terminal / Codex App 后续读取会话进展提供稳定契约。

**Architecture:** 在现有 bridge 与前端状态层之间新增 `shared session snapshot` 投影层。web 作为一期 writer，从现有线程消息、turn 状态、审批摘要和错误状态投影出共享快照，落盘到 `CODEX_HOME` 体系下的共享目录，并通过只读接口暴露给 reader；terminal writer 与 Codex App reader 作为外部接入方，通过同一份快照协议对接。

**Tech Stack:** Node.js、TypeScript、Vue 3、现有 bridge middleware、文件型本地存储、Node `node:test`

---

### Task 1: 固定共享快照协议与仓库边界

**Files:**
- Create: `docs/plans/2026-04-04-shared-session-snapshot-design.md`
- Create: `docs/plans/2026-04-04-shared-session-snapshot-implementation-plan.md`

**Step 1: 固定一期产品目标**

- 明确一期只做 `web writer + snapshot substrate + reader contract`
- 明确不做跨端审批与 takeover

**Step 2: 固定共享快照字段**

- `sessionId`
- `sourceThreadId`
- `owner`
- `state`
- `activeTurnId`
- `timeline`
- `attention`
- `updatedAtIso`

**Step 3: 固定仓库边界**

- 本仓库负责 web 侧 writer、存储和只读接口
- terminal writer 与 Codex App reader 仅通过契约接入，不在本轮仓库内伪实现

### Task 2: 为共享快照模型与存储工具写失败测试

**Files:**
- Create: `src/server/sharedSessionSnapshot.ts`
- Create: `src/server/sharedSessionStore.ts`
- Create: `tests/sharedSessionStore.test.mjs`

**Step 1: 为路径解析写测试**

- 验证有 `CODEX_HOME` 与无 `CODEX_HOME` 两种情况下的 snapshot 目录解析
- 验证 sessionId 被安全归一化

**Step 2: 为读写语义写测试**

- 写入一个 snapshot
- 读取同一 snapshot
- 断言关键字段保持一致

**Step 3: 为 lease 过期判断写测试**

- 输入未过期 snapshot
- 输入已过期 snapshot
- 断言 helper 能识别 `stale_owner`

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/sharedSessionStore.test.mjs`
Expected: FAIL，提示缺少共享快照模型或存储实现

### Task 3: 实现共享快照模型与文件存储

**Files:**
- Create: `src/server/sharedSessionSnapshot.ts`
- Create: `src/server/sharedSessionStore.ts`
- Test: `tests/sharedSessionStore.test.mjs`

**Step 1: 定义共享快照类型**

- 定义 `SharedSessionSnapshot`
- 定义 `SharedTimelineEntry`
- 定义 owner lease 校验辅助函数

**Step 2: 实现 snapshot 存储路径工具**

- 解析 `CODEX_HOME`
- 回退到 `~/.codex/shared-sessions`
- 生成 `sessionId.json` 路径

**Step 3: 实现文件读写与只读查询**

- `readSharedSessionSnapshot(sessionId)`
- `writeSharedSessionSnapshot(snapshot)`
- `listSharedSessionSnapshots()`

**Step 4: 重新运行存储测试**

Run: `node --test tests/sharedSessionStore.test.mjs`
Expected: PASS

### Task 4: 为 web projector 写失败测试

**Files:**
- Create: `src/server/sharedSessionProjector.ts`
- Create: `tests/sharedSessionProjector.test.mjs`

**Step 1: 为 thread 历史投影写测试**

- 输入消息列表、`activeTurnId`、`inProgress`
- 断言输出 snapshot timeline 与 state 正确

**Step 2: 为 attention 摘要写测试**

- 输入待审批 request、错误消息
- 断言 `attention.pendingApprovalCount` 和 `latestErrorMessage` 正确

**Step 3: 为 owner 语义写测试**

- 输入 owner=`web`
- 断言快照带有 owner 和 lease 字段

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/sharedSessionProjector.test.mjs`
Expected: FAIL，提示缺少 projector 导出或映射逻辑

### Task 5: 实现 web 侧 snapshot projector

**Files:**
- Create: `src/server/sharedSessionProjector.ts`
- Modify: `src/composables/useDesktopState.ts`
- Test: `tests/sharedSessionProjector.test.mjs`

**Step 1: 定义 projector 输入模型**

- 线程 id
- 标题、cwd
- 已完成消息
- `inProgress` / `activeTurnId`
- `pendingServerRequests`
- `persistedServerRequests`
- `turnError`

**Step 2: 实现 timeline 压缩逻辑**

- 仅保留最近若干条可稳定展示消息
- 在必要时追加 turn summary entry

**Step 3: 实现 state 与 attention 归一化**

- `running`
- `idle`
- `needs_attention`
- `failed`
- `interrupted`

**Step 4: 重新运行 projector 测试**

Run: `node --test tests/sharedSessionProjector.test.mjs`
Expected: PASS

### Task 6: 在 bridge 层接入共享快照写入与只读接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/server/httpServer.ts`
- Create: `tests/sharedSessionBridge.test.mjs`

**Step 1: 在合适的状态更新点触发 snapshot 写入**

- 线程加载后
- turn 状态变化后
- 审批状态变化后
- 错误状态变化后

**Step 2: 新增只读 HTTP 接口**

- `GET /codex-api/shared-sessions`
- `GET /codex-api/shared-sessions/:sessionId`

**Step 3: 保持单写多读语义**

- 只允许 web 侧 projector 写入
- reader 接口不提供写操作

**Step 4: 为接口行为补测试**

Run: `node --test tests/sharedSessionBridge.test.mjs`
Expected: PASS

### Task 7: 在前端增加共享快照 reader 能力

**Files:**
- Modify: `src/api/codexGateway.ts`
- Modify: `src/api/codexRpcClient.ts`
- Modify: `src/types/codex.ts`
- Modify: `src/composables/useDesktopState.ts`
- Create: `tests/sharedSessionUi.test.mjs`

**Step 1: 增加共享快照 API 封装**

- 读取单个 snapshot
- 列出 snapshot 列表

**Step 2: 增加前端只读类型**

- `UiSharedSessionSnapshot`
- `UiSharedSessionAttention`

**Step 3: 让状态层可消费共享快照**

- 缓存共享快照
- 提供 owner / state / attention 的只读视图

**Step 4: 补 reader 行为测试**

Run: `node --test tests/sharedSessionUi.test.mjs`
Expected: PASS

### Task 8: 补充 terminal / Codex App 接入契约说明

**Files:**
- Modify: `docs/plans/2026-04-04-shared-session-snapshot-design.md`
- Modify: `docs/plans/2026-04-04-shared-session-snapshot-implementation-plan.md`

**Step 1: 记录 terminal writer 需要补的最小字段**

- threadId
- state
- owner
- attention
- timeline 摘要

**Step 2: 记录 Codex App reader 的约束**

- 只读
- 不直接审批
- 必须明确返回控制端

**Step 3: 记录当前仓库外依赖**

- terminal 侧 writer 实现
- Codex App reader 实现

### Task 9: 完成回归验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-04-shared-session-snapshot-implementation-plan.md`

**Step 1: 运行共享快照存储测试**

Run: `node --test tests/sharedSessionStore.test.mjs`
Expected: PASS

**Step 2: 运行 projector 测试**

Run: `node --test tests/sharedSessionProjector.test.mjs`
Expected: PASS

**Step 3: 运行 bridge / UI 测试**

Run: `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionUi.test.mjs`
Expected: PASS

**Step 4: 运行现有测试集合**

Run: `node --test tests/*.mjs`
Expected: PASS

**Step 5: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 6: 回填执行结果**

- 记录实际新增 / 修改文件
- 记录实际实现边界
- 记录 reader / writer 仍未覆盖的外部部分

### 风险与回滚

- 风险：如果一期过早把 terminal 也做成 writer，会显著增加 owner 冲突风险，因此应坚持 web 单写。
- 风险：如果 reader UI 展示了可误解为可操作的审批按钮，会制造严重的产品认知偏差。
- 风险：若 snapshot 写入频率过高，可能导致不必要的磁盘抖动与性能负担，应在 projector 层做限频与幂等比较。
- 风险：本仓库无法直接完成 terminal writer 与 Codex App reader，只能提供契约与快照基础设施，计划必须诚实标注这一边界。
- 回滚：移除 `shared session snapshot` 存储、projector 和只读接口，恢复前端仅依赖现有 thread/read 与本地实时状态即可回退。

### 验收与验证命令

- web 能导出共享快照，至少包含 owner、state、timeline、attention、updatedAtIso。
- reader 能读取共享快照并看到会话进展，不误导为可直接审批。
- snapshot 存储路径稳定落在 `CODEX_HOME` / `.codex` 体系下。
- 共享快照方案不破坏现有线程列表、线程阅读和审批卡能力。
- `node --test tests/sharedSessionStore.test.mjs` 通过。
- `node --test tests/sharedSessionProjector.test.mjs` 通过。
- `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionUi.test.mjs` 通过。
- `node --test tests/*.mjs` 通过。
- `npm run build` 通过。

## 执行结果

### 已完成范围

- 已新增共享快照协议与文件型存储：
  - `src/server/sharedSessionSnapshot.ts`
  - `src/server/sharedSessionStore.ts`
- 已新增 web 侧 projector：
  - `src/server/sharedSessionProjector.ts`
- 已在 bridge 层接入 snapshot 只读接口与写入触发：
  - `src/server/codexAppServerBridge.ts`
- 已补前端 reader 契约：
  - `src/types/codex.ts`
  - `src/api/codexRpcClient.ts`
  - `src/api/codexGateway.ts`
  - `src/composables/useDesktopState.ts`
- 已补测试：
  - `tests/sharedSessionStore.test.mjs`
  - `tests/sharedSessionProjector.test.mjs`
  - `tests/sharedSessionBridge.test.mjs`
  - `tests/sharedSessionUi.test.mjs`

### 实际实现边界

- 一期仍然坚持 `web writer + multi reader`
- terminal writer 未在本仓库内实现
- Codex App reader 未在本仓库内实现
- 前端当前只暴露共享快照 reader 状态与 API，还没有单独渲染镜像视图
- shared snapshot 当前已覆盖审批状态变化、`turn/started` / `turn/completed` 生命周期通知，以及 `turn/start` / `turn/interrupt` RPC 成功后的刷新
- 更完整的“会话进展镜像”后续仍可继续补充更多事件来源，例如更细粒度的消息落盘或摘要刷新时机

### 实际验证结果

- `node --test tests/sharedSessionStore.test.mjs` 通过
- `node --test tests/sharedSessionProjector.test.mjs` 通过
- `node --test tests/sharedSessionBridge.test.mjs` 通过
- `node --test tests/sharedSessionUi.test.mjs` 通过
- `node --test tests/*.mjs` 通过
- `npm run build` 通过
