# Web Escalated Approval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Web 端对 `execCommandApproval` / `applyPatchApproval` 提权审批的承接，让审批正确出现在当前线程中并替代误导性的“AI 思考中”状态。

**Architecture:** 在 bridge 与前端通知归一化层统一补齐 `conversationId` 到线程归属的识别，再把新增两类审批 method 接入现有统一审批卡展示与响应映射。最后在 app 外层把“当前线程存在待审批请求”视为高优先级状态，压掉 thinking indicator，形成最小闭环。

**Tech Stack:** Vue 3、TypeScript、Node `node:test`、现有 app-server bridge、现有统一审批卡与 `uiText` 体系

---

### Task 1: 固定提权审批的协议归属和交互边界

**Files:**
- Create: `docs/plans/2026-04-05-web-escalated-approval-design.md`
- Create: `docs/plans/2026-04-05-web-escalated-approval-implementation-plan.md`

**Step 1: 固定线程归属规则**

- 对 pending server request 统一支持：
  - `threadId`
  - `thread_id`
  - `conversationId`
  - `conversation_id`

**Step 2: 固定审批 method 分组**

- 命令审批：
  - `item/commandExecution/requestApproval`
  - `execCommandApproval`
- 文件改动审批：
  - `item/fileChange/requestApproval`
  - `applyPatchApproval`

**Step 3: 固定 thinking indicator 退让规则**

- 当前线程只要有待审批请求，就不继续显示 “AI 思考中”

### Task 2: 先为线程归属写失败测试

**Files:**
- Modify: `tests/sharedSessionBridge.test.mjs`
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/composables/desktop-state/notification-parsers.ts`

**Step 1: 为 bridge 增加 `conversationId` 归属测试**

- 构造 `execCommandApproval` request
- 参数只提供 `conversationId`
- 断言 pending request 被归属到该线程而不是全局 scope

**Step 2: 为前端通知归一化增加 `conversationId` 归属测试**

- 构造 `server/request` notification
- 断言 `normalizeServerRequest()` 产出的 `threadId` 正确

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/sharedSessionBridge.test.mjs`
Expected: FAIL，表现为 `conversationId` 类型审批没有落入目标线程

### Task 3: 用最小代码修正 bridge 与通知归一化

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/composables/desktop-state/notification-parsers.ts`
- Test: `tests/sharedSessionBridge.test.mjs`

**Step 1: 抽出统一 request 线程 id 读取逻辑**

- 在 bridge 层补齐 `threadId/thread_id/conversationId/conversation_id`
- 在前端归一化层做同样回退

**Step 2: 重新运行相关测试**

Run: `node --test tests/sharedSessionBridge.test.mjs`
Expected: PASS

### Task 4: 先为新增审批类型写失败测试

**Files:**
- Modify: `tests/approvalRequestDisplay.test.mjs`
- Modify: `tests/approvalRequestUi.test.mjs`
- Modify: `src/utils/approvalRequestDisplay.ts`
- Modify: `src/components/content/ThreadConversation.vue`

**Step 1: 为 `execCommandApproval` 写 display helper 测试**

- 输入 `command: string[]`、`cwd`、`reason`
- 断言能输出命令审批模型
- 断言第二选项映射到 session 或规则授权

**Step 2: 为 `applyPatchApproval` 写 display helper 测试**

- 输入 `reason`、`grantRoot`、`fileChanges`
- 断言能输出文件改动审批模型

**Step 3: 为会话组件接线写测试**

- 断言 `ThreadConversation.vue` 对新旧四类审批都走 `ApprovalRequestCard`

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs`
Expected: FAIL，表现为新 method 尚未被识别

### Task 5: 实现新增审批类型的统一展示与响应映射

**Files:**
- Modify: `src/utils/approvalRequestDisplay.ts`
- Modify: `src/components/content/ThreadConversation.vue`
- Modify: `src/components/content/ApprovalRequestCard.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/approvalRequestDisplay.test.mjs`
- Test: `tests/approvalRequestUi.test.mjs`

**Step 1: 扩展审批展示模型**

- 支持从 `command: string[]` 生成展示用命令文本
- 支持从 `fileChanges` map 推导文件数、增删统计与文件列表
- 兼容旧类型字段缺失时的占位文本

**Step 2: 扩展 method 判定**

- `execCommandApproval` 走命令审批卡
- `applyPatchApproval` 走文件改动审批卡

**Step 3: 扩展 decision 映射**

- 旧类型仍返回原有 decision 结构
- 新类型提交 `ReviewDecision`
  - 允许一次
  - 允许本会话
  - 规则授权
  - 拒绝
  - 跳过/中止

**Step 4: 重新运行审批测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs`
Expected: PASS

### Task 6: 先为 thinking indicator 退让规则写失败测试

**Files:**
- Modify: `tests/sharedSessionStatusCard.test.mjs`
- Modify: `tests/sidebarSharedSessionOverview.test.mjs`
- Modify: `src/App.vue`

**Step 1: 新增计算逻辑测试**

- 构造当前线程 `inProgress = true`
- 同时存在 `pendingRequests`
- 断言 thinking indicator 不再显示

**Step 2: 运行测试并确认先失败**

Run: `node --test tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: FAIL，表现为当前逻辑仍显示思考态

### Task 7: 实现 thinking indicator 退让逻辑

**Files:**
- Modify: `src/App.vue`
- Test: `tests/sharedSessionStatusCard.test.mjs`
- Test: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 将待审批视为更高优先级 UI 状态**

- 读取当前线程 pending requests 数量
- 有待审批时隐藏 thinking indicator

**Step 2: 重新运行相关测试**

Run: `node --test tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

### Task 8: 回归验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-05-web-escalated-approval-implementation-plan.md`

**Step 1: 运行桥接与审批测试**

Run: `node --test tests/sharedSessionBridge.test.mjs tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs`
Expected: PASS

**Step 2: 运行共享会话与侧边栏相关回归**

Run: `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 4: 回填执行结果**

- 记录实际修改文件
- 记录验证命令与结果
- 标注与计划的偏差

### 风险与回滚

- 风险：`execCommandApproval` 与旧命令审批的响应 payload 不同，若映射混用会导致后端拒绝响应，因此 helper 需要明确区分新旧协议。
- 风险：`applyPatchApproval` 自带的 `fileChanges` 结构可能与现有 turn diff 模型不完全一致，展示层必须做安全降级，不能因字段缺失导致整卡消失。
- 风险：thinking indicator 如果按“全局存在审批”隐藏，会误伤其他线程；逻辑必须只看当前线程。
- 回滚：恢复旧线程 id 提取逻辑、撤销新 method 到审批卡的分支、恢复 thinking indicator 原判定即可。

### 验收与验证命令

- Web 端在收到 `execCommandApproval` 时，当前线程能看到命令审批卡。
- Web 端在收到 `applyPatchApproval` 时，当前线程能看到文件改动审批卡。
- 提权审批出现时，不再继续显示误导性的 “AI 思考中”。
- 旧的 `item/commandExecution/requestApproval` / `item/fileChange/requestApproval` 行为不回退。
- `node --test tests/sharedSessionBridge.test.mjs tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs` 通过。
- `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs` 通过。
- `npm run build` 通过。

## 执行结果

### 实际完成项

- 已修改 `src/server/codexAppServerBridge.ts`，让 pending request 线程归属同时支持 `threadId/thread_id/conversationId/conversation_id`。
- 已修改 `src/composables/desktop-state/notification-parsers.ts`，让前端 `server/request` 归一化对 `conversationId` 保持同样兼容。
- 已修改 `src/utils/approvalRequestDisplay.ts`，让 `execCommandApproval` 和 `applyPatchApproval` 复用统一审批卡展示模型，并区分旧协议 decision 与新协议 `ReviewDecision`。
- 已修改 `src/components/content/ThreadConversation.vue`，让新旧四类审批都走 `ApprovalRequestCard`，并在跳过时根据协议返回 `cancel` 或 `abort`。
- 已新增 `src/utils/thinkingIndicatorState.ts`，把“有待审批时不显示思考态”抽成可测试的纯函数。
- 已修改 `src/App.vue`，用新的 helper 控制 thinking indicator 显隐。
- 已补充 `tests/sharedSessionBridge.test.mjs`、`tests/approvalRequestDisplay.test.mjs`、`tests/approvalRequestUi.test.mjs`、`tests/thinkingIndicatorState.test.mjs`，覆盖线程归属、新 method 展示、新 method 接线与 thinking indicator 退让。

### 实际偏差

- `applyPatchApproval` 的文件统计优先直接从 request 自带 `fileChanges` 推导，而不是复用 turn diff 快照；这样能覆盖没有 `turnId/itemId` 的提权审批场景。
- 本轮没有额外新增中文文案 key，沿用了现有统一审批卡文案体系。

### 验证结果

- 2026-04-05：已通过 `node --test tests/sharedSessionBridge.test.mjs tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs tests/thinkingIndicatorState.test.mjs`。
- 2026-04-05：已通过 `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`。
- 2026-04-05：已通过 `npm run build`。
