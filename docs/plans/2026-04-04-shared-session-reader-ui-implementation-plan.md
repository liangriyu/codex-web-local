# Shared Session Reader UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正共享会话 reader UI 的 owner 归属与展示结构，让 web 端能正确显示控制端，并以更紧凑清晰的方式展示最近共享进展。

**Architecture:** bridge 在刷新快照时优先继承已有 snapshot 的 owner 信息，避免把外部控制端覆盖成 `web`。详情页状态卡改成“状态头 + 最近 3 条共享进展”，侧边栏线程行改成主列与固定时间列分离的两行布局。所有改动保持只读，不引入审批或 takeover 交互。

**Tech Stack:** Node.js、TypeScript、Vue 3、Node `node:test`、`npm run build`

---

### Task 1: 固定修复边界

**Files:**
- Create: `docs/plans/2026-04-04-shared-session-reader-ui-design.md`
- Create: `docs/plans/2026-04-04-shared-session-reader-ui-implementation-plan.md`

**Step 1: 固定 owner 语义**

- web writer 不再无条件覆盖已有 owner
- 优先继承已有 snapshot 中的 owner / ownerInstanceId / ownerLeaseExpiresAtIso

**Step 2: 固定状态卡边界**

- 保持只读
- 展示最近 3 条共享进展
- 不引入审批按钮与 takeover

**Step 3: 固定侧边栏边界**

- 仅做布局与摘要展示优化
- 不新增筛选、专题区或额外操作

### Task 2: 写失败测试

**Files:**
- Modify: `tests/sharedSessionBridge.test.mjs`
- Modify: `tests/sharedSessionStatusCard.test.mjs`
- Modify: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 写 bridge owner 继承测试**

- 先落盘一个 owner=`terminal` 的旧 snapshot
- 再执行 `syncSharedSessionSnapshot()`
- 断言新 snapshot 仍保留 terminal owner 信息

**Step 2: 写状态卡时间线测试**

- 断言组件包含最近共享进展列表容器
- 断言最多展示 3 条条目
- 断言仍保持只读

**Step 3: 写侧边栏布局测试**

- 断言线程行存在主列与固定时间列结构
- 断言共享摘要和标题都在主列内截断

**Step 4: 运行测试确认先失败**

Run: `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: FAIL，提示缺少 owner 继承、状态卡时间线结构或侧边栏布局约束

### Task 3: 实现 bridge owner 继承

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/sharedSessionBridge.test.mjs`

**Step 1: 读取已有 snapshot**

- 在刷新线程 snapshot 前读取 `readSharedSessionSnapshot(threadId)`

**Step 2: 合并 owner 字段**

- 优先继承历史 snapshot 中的 `owner`
- 一并继承 `ownerInstanceId` 与 `ownerLeaseExpiresAtIso`

**Step 3: 运行 bridge 测试**

Run: `node --test tests/sharedSessionBridge.test.mjs`
Expected: PASS

### Task 4: 实现状态卡时间线式正文

**Files:**
- Modify: `src/components/content/SharedSessionStatusCard.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/sharedSessionStatusCard.test.mjs`

**Step 1: 计算最近进展条目**

- 从 `timeline` 中筛出适合展示的条目
- 只取最近 3 条
- 无条目时回退单条摘要

**Step 2: 调整展示结构**

- 新增时间线列表容器
- 每条进展单独渲染
- 头部和 pills 保持存在

**Step 3: 运行状态卡测试**

Run: `node --test tests/sharedSessionStatusCard.test.mjs`
Expected: PASS

### Task 5: 修正侧边栏线程行布局

**Files:**
- Modify: `src/components/sidebar/SidebarMenuRow.vue`
- Modify: `src/components/sidebar/SidebarThreadTree.vue`
- Test: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 固定时间列**

- 右侧时间列给固定宽度
- 防止挤压主内容列

**Step 2: 固定正文列**

- 标题和共享摘要统一放在主列中
- 两者都做单行截断

**Step 3: 运行侧边栏测试**

Run: `node --test tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

### Task 6: 回填与验证

**Files:**
- Modify: `docs/plans/2026-04-04-shared-session-reader-ui-implementation-plan.md`
- Modify: `docs/plans/2026-04-04-shared-session-status-card-implementation-plan.md`
- Modify: `docs/plans/2026-04-04-sidebar-shared-session-overview-implementation-plan.md`

**Step 1: 运行共享会话相关测试**

Run: `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录 owner 继承已接入
- 记录状态卡改成最近共享进展列表
- 记录侧边栏已消除标题/时间遮挡

## 执行结果

### 已完成范围

- bridge 刷新共享快照时已优先继承既有 snapshot 的 `owner`、`ownerInstanceId`、`ownerLeaseExpiresAtIso`
- 详情页共享状态卡已改成“状态头 + 最近 3 条共享进展”结构，并作为消息流前置内容随消息一起滚动
- 侧边栏线程行已改成主列与固定时间列分离，标题和共享摘要都在主列内截断

### 实际实现边界

- 当前 owner 修正依赖已有共享快照中存在真实 owner 信息
- 状态卡仍保持只读，不提供审批、接管或跳转动作，也不再强调“当前由谁控制”
- 最近进展列表当前优先展示 `assistant_message`、`turn_summary`、`attention`，最多 3 条

### 实际验证结果

- `node --test tests/sharedSessionBridge.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs` 通过
- `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionBridge.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs` 通过
- `npm run build` 通过
