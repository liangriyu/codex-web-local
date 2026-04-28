# Mobile Approval Action Bar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复移动端审批浮层底部按钮被遮挡的问题，让 `提交` 在手机端始终可见。

**Architecture:** 保持现有审批浮层与审批卡结构不变，只在 `ApprovalRequestCard.vue` 的移动端样式层引入 sticky 底栏、安全区留白和更稳的按钮布局。必要时在浮层容器补充窄屏留白，但不改变审批数据流与交互事件。

**Tech Stack:** Vue 3、Tailwind `@apply`、CSS `env(safe-area-inset-bottom)`、Node `node:test`

---

### Task 1: 为移动端 sticky 底栏写失败测试

**Files:**
- Modify: `tests/approvalRequestUi.test.mjs`
- Modify: `tests/pendingApprovalOverlay.test.mjs`

**Step 1: 为审批卡移动端底栏写测试**

- 断言 `ApprovalRequestCard.vue` 存在移动端 `position: sticky`
- 断言存在 `safe-area-inset-bottom`
- 断言按钮区域在窄屏下采用稳定双列布局

**Step 2: 为浮层容器移动端承载写测试**

- 断言 `PendingApprovalOverlay.vue` 为窄屏保留可见边距或底部空间

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs`
Expected: FAIL，表现为移动端 sticky / safe-area 约束尚未写入组件

### Task 2: 实现移动端审批底栏

**Files:**
- Modify: `src/components/content/ApprovalRequestCard.vue`
- Modify: `src/components/content/PendingApprovalOverlay.vue`

**Step 1: 调整审批卡移动端布局**

- 在移动端为 `approval-actions` 增加 sticky 底栏样式
- 为底栏补充背景、边界和 `safe-area-inset-bottom`
- 让按钮在窄屏下双列等宽显示

**Step 2: 调整浮层容器窄屏留白**

- 保证浮层外层与卡片底部在移动端不会被裁切

**Step 3: 重新运行测试**

Run: `node --test tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs`
Expected: PASS

### Task 3: 回归验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-05-mobile-approval-action-bar-implementation-plan.md`

**Step 1: 运行相关审批测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs tests/thinkingIndicatorState.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录修改文件
- 记录测试命令与结果
- 记录与计划偏差

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/components/content/ApprovalRequestCard.vue`
- `src/components/content/PendingApprovalOverlay.vue`
- `tests/approvalRequestUi.test.mjs`
- `tests/pendingApprovalOverlay.test.mjs`
- `docs/plans/2026-04-05-mobile-approval-action-bar-implementation-plan.md`

**实现结果:**
- 移动端审批卡底部操作区已改为 `sticky` 底栏
- 底栏增加了 `safe-area-inset-bottom` 留白，避免被手机浏览器底栏遮挡
- `跳过 / 提交` 在窄屏下改为双列等宽布局
- 审批浮层容器在手机端增加了底部留白与最大高度限制，正文改为容器内滚动
- 桌面端原有审批卡结构与交互保持不变

**验证记录:**
- `node --test tests/approvalRequestUi.test.mjs`：PASS
- `node --test tests/pendingApprovalOverlay.test.mjs`：PASS
- `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs tests/thinkingIndicatorState.test.mjs`：PASS
- `npm run build`：PASS

**与计划偏差:**
- 未新增独立移动端组件，直接在现有 `ApprovalRequestCard.vue` 与 `PendingApprovalOverlay.vue` 上完成样式收口
- 测试中将浮层安全区断言从具体 Tailwind 任意值类收敛为行为等价的 CSS 关键字校验，以降低实现耦合
