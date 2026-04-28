# File Change Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `apply_patch` 型真实文件改动补一条基于 session jsonl 的摘要 fallback，让刷新后仍能恢复文件变更卡片。

**Architecture:** 保持现有 `turn/diff/updated` 和 `thread/read.fileChanges` 链路不变，只在它们都缺失时增加服务端 fallback。服务端从目标线程 session jsonl 提取最近一次可恢复文件摘要，前端命中后继续复用现有 `latestFileChangesByThreadId` 与 summary-only 持久化。

**Tech Stack:** Vue 3、TypeScript、Node `node:test`、Express bridge、session jsonl 解析

---

### Task 1: 为 session jsonl fallback 解析补失败测试

**Files:**
- Create: `tests/threadFileChangesFallback.test.mjs`
- Create: `tests/fixtures/thread-file-changes-fallback/session-apply-patch.jsonl`
- Create: `tests/fixtures/thread-file-changes-fallback/session-no-file-change.jsonl`

**Step 1: 写服务端 fallback 失败测试**

断言以下行为：

- `apply_patch` 型 session jsonl 能提取最近一次文件变更摘要
- 无文件变更事件时返回 `null`
- 损坏或不完整记录不会抛未处理异常

**Step 2: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesFallback.test.mjs`
Expected: FAIL，表现为 fallback 解析模块不存在

### Task 2: 实现服务端 fallback 解析模块与只读接口

**Files:**
- Create: `src/server/threadFileChangesFallback.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/threadFileChangesFallback.test.mjs`

**Step 1: 写最小解析实现**

在 `src/server/threadFileChangesFallback.ts` 中：

- 读取目标线程 session jsonl
- 逆序定位最近一次文件变更相关 turn
- 支持从 `custom_tool_call apply_patch` 提取文件路径
- 输出 summary-only 结构

**Step 2: 暴露只读接口**

在 `src/server/codexAppServerBridge.ts` 中新增接口：

- `GET /codex-api/thread-file-changes/fallback?threadId=<id>`

要求：

- threadId 为空返回 `400`
- 命中返回摘要对象
- 未命中返回 `null`
- 解析失败返回 `200 + null`，不破坏主链路

**Step 3: 重新运行测试**

Run: `node --test tests/threadFileChangesFallback.test.mjs`
Expected: PASS

### Task 3: 为前端 fallback 接线补失败测试

**Files:**
- Modify: `tests/threadFileChangesPersistence.test.mjs`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 扩展前端失败测试**

增加断言：

- `thread/read.fileChanges` 为空时会请求 fallback 接口
- fallback 命中后会更新 `latestFileChangesByThreadId`
- fallback 结果会继续写入 `thread-file-changes.v2`

**Step 2: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesPersistence.test.mjs`
Expected: FAIL，表现为当前前端没有 fallback 请求

### Task 4: 实现前端 fallback 接线

**Files:**
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/types/codex.ts`
- Test: `tests/threadFileChangesPersistence.test.mjs`

**Step 1: 新增前端读取接口**

在 `src/api/codexGateway.ts` 中新增读取函数：

- 请求 `/codex-api/thread-file-changes/fallback`
- 归一化成 `UiTurnFileChanges | null`
- 缺失 `diff` 时补空字符串

**Step 2: 接入 `loadMessages`**

在 `src/composables/useDesktopState.ts` 中：

- `thread/read.fileChanges` 为空时调用 fallback
- fallback 命中后复用现有状态写入和 `saveLatestFileChangesMap()`
- 保持原有 `turn/diff/updated` 实时链路不变

**Step 3: 重新运行测试**

Run: `node --test tests/threadFileChangesPersistence.test.mjs tests/threadFileChangesFallback.test.mjs`
Expected: PASS

### Task 5: 全链路回归与文档回填

**Files:**
- Modify: `docs/plans/2026-04-05-file-change-fallback-implementation-plan.md`

**Step 1: 运行相关测试**

Run: `node --test tests/threadFileChangesPersistence.test.mjs tests/threadFileChangesFallback.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录实际修改文件
- 记录验证命令与结果
- 记录与计划偏差

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/api/codexGateway.ts`
- `src/api/codexRpcClient.ts`
- `src/server/codexAppServerBridge.ts`
- `src/server/threadFileChangesFallback.ts`
- `tests/fixtures/thread-file-changes-fallback/session-apply-patch.jsonl`
- `tests/fixtures/thread-file-changes-fallback/session-no-file-change.jsonl`
- `tests/sharedSessionBridge.test.mjs`
- `tests/threadFileChangesFallback.test.mjs`
- `tests/threadFileChangesFallbackClient.test.mjs`

**验证记录:**
- `node --test tests/threadFileChangesFallback.test.mjs tests/threadFileChangesFallbackClient.test.mjs tests/sharedSessionBridge.test.mjs tests/threadFileChangesPersistence.test.mjs tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs tests/sharedSessionStore.test.mjs tests/sharedSessionUi.test.mjs`：PASS
- `npm run build`：PASS

**与计划偏差:**
- Task 1 在开始实现前先按 reviewer 反馈收紧了测试：fixture 改成同时覆盖 `item.arguments` 与更接近真实 session 的 `payload + turn_id + input` 形态，并放宽了对 `totalAdditions/totalDeletions` 的过度约束。
- Task 2 额外补了 `tests/sharedSessionBridge.test.mjs` 的 bridge endpoint 回归，确保服务端不只是 parser 通过，而且 `/codex-api/thread-file-changes/fallback` 真实可读。
- Task 3 没有沿原计划去改 `tests/threadFileChangesPersistence.test.mjs`，而是新增 `tests/threadFileChangesFallbackClient.test.mjs` 专门约束 rpc client 与 gateway fallback 合同，避免把旧持久化测试变成多职责用例。
- Task 4 最终只改了 `src/api/codexRpcClient.ts` 和 `src/api/codexGateway.ts`，没有改 `src/composables/useDesktopState.ts` 或 `src/types/codex.ts`。原因是 gateway 已经返回现成的 `UiTurnFileChanges | null`，现有状态层对非空 `fileChanges` 的持久化和摘要恢复逻辑可以直接复用。
