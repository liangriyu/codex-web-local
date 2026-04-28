# Shared Session Status Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在线程详情页顶部增加一张只读共享会话状态卡，让用户在消息流之前就能看到当前控制端、运行状态、最近进展和 attention 摘要。

**Architecture:** 新增一个 `SharedSessionStatusCard` 展示组件，由 `App.vue` 在线程详情页中消费 `selectedSharedSessionSnapshot`。组件只读取共享快照，不暴露审批或接管能力；文案通过 `uiText` 统一管理，测试以源码回归和构建验证为主。

**Tech Stack:** Vue 3、TypeScript、现有 `useDesktopState`、`node:test`、`npm run build`

---

### Task 1: 固定状态卡接入边界

**Files:**
- Create: `docs/plans/2026-04-04-shared-session-status-card-implementation-plan.md`
- Modify: `docs/plans/2026-04-04-shared-session-snapshot-implementation-plan.md`

**Step 1: 记录状态卡位置**

- 线程详情页顶部
- 位于消息流上方
- 仅在 `selectedSharedSessionSnapshot` 存在时显示

**Step 2: 记录只读边界**

- 不放审批按钮
- 不放 takeover
- 不伪装成控制面板

**Step 3: 记录展示字段**

- `state`
- `owner`
- `latestTurnSummary`
- `attention`
- `activeTurnId`

### Task 2: 为状态卡和 App 接线写失败测试

**Files:**
- Create: `tests/sharedSessionStatusCard.test.mjs`

**Step 1: 写组件存在性测试**

- 断言将新增 `SharedSessionStatusCard.vue`
- 断言组件包含状态 chip、摘要区和 metadata pill

**Step 2: 写 App 接入测试**

- 断言 `App.vue` 引入 `SharedSessionStatusCard`
- 断言在线程详情页消息流上方传入 `selectedSharedSessionSnapshot`

**Step 3: 写文案测试**

- 断言 `uiText.ts` 增加共享状态卡相关中文文案

**Step 4: 运行测试确认先失败**

Run: `node --test tests/sharedSessionStatusCard.test.mjs`
Expected: FAIL，提示缺少组件、接线或文案

### Task 3: 实现共享状态卡组件与文案

**Files:**
- Create: `src/components/content/SharedSessionStatusCard.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/sharedSessionStatusCard.test.mjs`

**Step 1: 实现组件 props 与展示逻辑**

- 输入 `snapshot`
- 输入 `uiLanguage`
- 将 `state` 映射为中文产品化文案
- 将 `owner` 映射为 `web / terminal`

**Step 2: 实现最小展示结构**

- 状态 chip
- 主摘要文案
- attention 摘要文案
- metadata pills

**Step 3: 保持只读约束**

- 不暴露任何按钮型操作
- 不接入审批或 takeover 事件

**Step 4: 运行测试确认通过**

Run: `node --test tests/sharedSessionStatusCard.test.mjs`
Expected: PASS

### Task 4: 在线程详情页接入状态卡

**Files:**
- Modify: `src/App.vue`
- Modify: `src/composables/useDesktopState.ts`
- Test: `tests/sharedSessionStatusCard.test.mjs`

**Step 1: 在 App 中接入状态卡**

- 在线程详情页消息流上方渲染
- 传入 `selectedSharedSessionSnapshot`
- 传入 `uiLanguage`

**Step 2: 保持状态层只读**

- 继续复用现有 `selectedSharedSessionSnapshot`
- 不引入新的写逻辑

**Step 3: 调整必要的布局样式**

- 不破坏现有 `ThreadConversation` 和 `CodePreviewPanel` 布局
- 保持桌面与窄屏下均可读

### Task 5: 回填文档与验证

**Files:**
- Modify: `docs/plans/2026-04-04-shared-session-status-card-implementation-plan.md`

**Step 1: 运行状态卡测试**

Run: `node --test tests/sharedSessionStatusCard.test.mjs`
Expected: PASS

**Step 2: 运行共享快照相关测试**

Run: `node --test tests/sharedSessionUi.test.mjs tests/sharedSessionBridge.test.mjs`
Expected: PASS

**Step 3: 运行全量测试**

Run: `node --test tests/*.mjs`
Expected: PASS

**Step 4: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 5: 回填执行结果**

- 记录实际创建的组件
- 记录状态卡仍然只读
- 记录后续可继续做的镜像总览或跳转动作

## 执行结果

### 已完成范围

- 已新增只读组件：
  - `src/components/content/SharedSessionStatusCard.vue`
- 已在线程详情页顶部接入：
  - `src/App.vue`
- 已补充共享状态卡文案：
  - `src/i18n/uiText.ts`
- 已新增 UI 回归测试：
  - `tests/sharedSessionStatusCard.test.mjs`

### 实际实现边界

- 状态卡仅消费 `selectedSharedSessionSnapshot`
- 当前展示 `state`、最近 3 条共享进展、`attention`、`activeTurnId`
- 组件保持完全只读，不提供审批、接管或跳转能力
- 当前作为消息流前置内容随消息一起滚动，不再单独固定在详情页顶部

### 实际验证结果

- `node --test tests/sharedSessionStatusCard.test.mjs` 通过
- `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionBridge.test.mjs tests/sharedSessionStatusCard.test.mjs` 通过
- `npm run build` 通过
