# Web Approval Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Web 端待审批请求增加自动浮出的审批浮层，并修复审批模型失败时渲染空白的问题。

**Architecture:** 在 `App.vue` 里计算当前线程首个可展示审批请求，并通过新的 `PendingApprovalOverlay.vue` 在 composer 上方高优先级呈现；消息流继续承载请求上下文，但跳过与浮层重复的那一条。`ThreadConversation.vue` 只在审批模型可用时才渲染审批卡，否则回退到通用 request-card。展示 helper 同时兼容 `camelCase` 和 `snake_case` payload。

**Tech Stack:** Vue 3、TypeScript、scoped CSS、Node `node:test`、现有 `ApprovalRequestCard` 与 `useDesktopState`

---

### Task 1: 固定审批浮层与回退规则

**Files:**
- Create: `docs/plans/2026-04-05-web-approval-overlay-design.md`
- Create: `docs/plans/2026-04-05-web-approval-overlay-implementation-plan.md`

**Step 1: 固定浮层入口**

- 当前线程只要存在可展示审批请求，就在 composer 上方显示审批浮层
- 仅展示一条主审批请求

**Step 2: 固定消息流去重规则**

- 浮层显示的同一 `request.id` 不在消息流重复渲染审批卡

**Step 3: 固定失败兜底规则**

- 审批模型构建失败时，必须回退到通用 request-card

### Task 2: 先为 helper 宽容解析写失败测试

**Files:**
- Modify: `tests/approvalRequestDisplay.test.mjs`
- Modify: `src/utils/approvalRequestDisplay.ts`

**Step 1: 为 `snake_case` 命令审批写测试**

- 输入 `proposed_execpolicy_amendment`
- 断言仍能生成命令审批模型

**Step 2: 为 `snake_case` 文件审批写测试**

- 输入 `file_changes`
- 断言仍能生成文件改动审批模型

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/approvalRequestDisplay.test.mjs`
Expected: FAIL，表现为 helper 只能识别 `camelCase`

### Task 3: 先为审批浮层与回退逻辑写失败测试

**Files:**
- Create: `tests/pendingApprovalOverlay.test.mjs`
- Modify: `tests/approvalRequestUi.test.mjs`
- Modify: `src/App.vue`
- Modify: `src/components/content/ThreadConversation.vue`

**Step 1: 为 `App.vue` 浮层接线写测试**

- 断言引入新浮层组件
- 断言浮层位于 composer 上方
- 断言使用当前线程审批请求与文件改动数据

**Step 2: 为消息流去重写测试**

- 断言 `ThreadConversation.vue` 支持接收浮层请求 id
- 断言对应审批请求不再 inline 重复渲染

**Step 3: 为审批失败兜底写测试**

- 断言审批分支不会在模型为空时直接吞掉内容
- 断言仍保留 `request-card` 回退路径

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs`
Expected: FAIL，表现为浮层尚未接入、消息流未去重、审批为空时无显式兜底

### Task 4: 实现 helper 宽容解析

**Files:**
- Modify: `src/utils/approvalRequestDisplay.ts`
- Test: `tests/approvalRequestDisplay.test.mjs`

**Step 1: 增加 `camelCase/snake_case` 双形态读取**

- `proposedExecpolicyAmendment` / `proposed_execpolicy_amendment`
- `fileChanges` / `file_changes`
- 其他必要字段做同类兼容

**Step 2: 重新运行 helper 测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs`
Expected: PASS

### Task 5: 实现审批浮层组件与接线

**Files:**
- Create: `src/components/content/PendingApprovalOverlay.vue`
- Modify: `src/App.vue`
- Modify: `src/components/content/ThreadConversation.vue`
- Test: `tests/approvalRequestUi.test.mjs`
- Test: `tests/pendingApprovalOverlay.test.mjs`

**Step 1: 新增浮层组件**

- 复用 `ApprovalRequestCard`
- 对外暴露 `submit / skip / openWorkspaceDiff`

**Step 2: 在 `App.vue` 计算主审批请求**

- 只取当前线程首个可展示审批请求
- 浮层插入到 `content-composer-row` 中、composer 之前

**Step 3: 在消息流里跳过浮层对应请求**

- 新增 `floatingRequestId` prop
- 匹配 id 的请求不再 inline 渲染审批卡

**Step 4: 重新运行 UI 测试**

Run: `node --test tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs`
Expected: PASS

### Task 6: 实现审批模型失败回退

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Test: `tests/approvalRequestUi.test.mjs`

**Step 1: 拆出审批分支判定**

- “是审批类 request 且模型存在”才走 `ApprovalRequestCard`
- 否则继续走 `request-card`

**Step 2: 重新运行相关测试**

Run: `node --test tests/approvalRequestUi.test.mjs`
Expected: PASS

### Task 7: 回归验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-05-web-approval-overlay-implementation-plan.md`

**Step 1: 运行审批相关测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs tests/thinkingIndicatorState.test.mjs`
Expected: PASS

**Step 2: 运行 bridge 与共享会话相关回归**

Run: `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 4: 回填执行结果**

- 记录新增浮层组件和测试文件
- 记录验证命令与结果
- 标注与计划偏差

## 执行结果

### 实际完成项

- 已新增 `src/components/content/PendingApprovalOverlay.vue`，复用 `ApprovalRequestCard` 作为当前线程审批浮层。
- 已修改 `src/App.vue`，在 composer 上方渲染 `selectedPrimaryApprovalRequest` 浮层，并把对应 `request.id` 传给消息流用于去重。
- 已修改 `src/components/content/ThreadConversation.vue`，新增 `floatingRequestId` 支持，只在审批模型可用时渲染审批卡，否则回退到通用 `request-card`。
- 已修改 `src/utils/approvalRequestDisplay.ts`，增加 `snake_case` 兼容读取，并暴露审批 method 判定 helper。
- 已新增 `tests/pendingApprovalOverlay.test.mjs`，并补充 `tests/approvalRequestDisplay.test.mjs`、`tests/approvalRequestUi.test.mjs` 以覆盖浮层接线、回退规则和 `snake_case` payload。

### 实际偏差

- 浮层没有做成全屏锁定模态，而是做成 composer 上方的高优先级居中浮层，以避免破坏当前消息滚动结构。
- 对“审批模型失败”的兜底目前回退到通用 request-card，而不是再单独实现一套简化审批卡。

### 验证结果

- 2026-04-05：已通过 `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs tests/thinkingIndicatorState.test.mjs`。
- 2026-04-05：已通过 `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`。
- 2026-04-05：已通过 `npm run build`。
