# Persisted Approval Record UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正 Web 端对 persisted 未解决审批记录的展示语义，避免把不可操作的历史记录误显示为当前待审批。

**Architecture:** 保持 bridge 与 snapshot 现状不变，在 `App.vue` 中把当前线程的 live/persisted 审批计数传入 `SharedSessionStatusCard`，由卡片组件在 UI 层做语义分流。真正的 live approvals 继续保持现有浮层和审批卡；只有 persisted-only 场景改为“遗留记录，需要重新触发审批”。

**Tech Stack:** Vue 3、TypeScript、Node `node:test`、现有 `uiText` 文案体系

---

### Task 1: 固定 persisted-only 场景的文案规则

**Files:**
- Create: `docs/plans/2026-04-05-persisted-approval-record-ui-design.md`
- Create: `docs/plans/2026-04-05-persisted-approval-record-ui-implementation-plan.md`

**Step 1: 固定 live 场景**

- live approvals > 0 时继续使用“等待处理 / X 条授权待处理”

**Step 2: 固定 persisted-only 场景**

- live approvals = 0
- persisted approvals > 0
- 使用“发现遗留记录 / 需要重新触发审批”

### Task 2: 先写失败测试

**Files:**
- Modify: `tests/sharedSessionStatusCard.test.mjs`
- Modify: `tests/sidebarSharedSessionOverview.test.mjs`
- Modify: `src/components/content/SharedSessionStatusCard.vue`
- Modify: `src/App.vue`

**Step 1: 为状态卡 persisted-only 文案写测试**

- 断言组件存在 persisted-only 文案 key
- 断言组件接收 live/persisted 计数 props

**Step 2: 为 `App.vue` 接线写测试**

- 断言 `selectedThreadPersistedServerRequests` 被传给 `SharedSessionStatusCard`
- 断言 live request 长度也被传入

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: FAIL，表现为 persisted-only 文案和 props 尚未接入

### Task 3: 实现 UI 语义分流

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/content/SharedSessionStatusCard.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/sharedSessionStatusCard.test.mjs`
- Test: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 在 `App.vue` 接入计数**

- 向 `SharedSessionStatusCard` 传：
  - `liveApprovalCount`
  - `persistedApprovalCount`

**Step 2: 在状态卡中增加 persisted-only 判定**

- 重写状态标签
- 重写 attention 文案
- 重写 pill 文案

**Step 3: 重新运行相关测试**

Run: `node --test tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

### Task 4: 回归验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-05-persisted-approval-record-ui-implementation-plan.md`

**Step 1: 运行审批与状态相关测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs tests/approvalRequestUi.test.mjs tests/pendingApprovalOverlay.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录修改文件
- 记录验证命令与结果
- 标注与计划偏差

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/App.vue`
- `src/components/content/SharedSessionStatusCard.vue`
- `src/i18n/uiText.ts`
- `tests/sharedSessionStatusCard.test.mjs`
- `tests/sidebarSharedSessionOverview.test.mjs`
- `docs/plans/2026-04-05-persisted-approval-record-ui-implementation-plan.md`

**实现结果:**
- `App.vue` 已向 `SharedSessionStatusCard` 透传当前线程的 `liveApprovalCount` 与 `persistedApprovalCount`
- `SharedSessionStatusCard.vue` 已在 UI 层区分 live approvals 与 persisted-only records
- persisted-only 场景下不再显示“X 条授权待处理”，改为“X 条遗留授权记录 · X 条授权记录已失效，请重新触发审批”
- meta pill 也改为短文案“X 条遗留记录”，避免误导为可直接审批
- live approval overlay 与消息流内审批卡逻辑保持不变

**验证记录:**
- `node --test tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`：PASS
- `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionBridge.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`：PASS
- `npm run build`：PASS

**与计划偏差:**
- 未改动 bridge、snapshot projector 或 persisted 数据结构，按原计划保持最小范围
- 状态标签保持现有 `needs_attention` 体系，仅调整正文与 pill 文案；这样可以减少对现有视觉状态映射的扰动
