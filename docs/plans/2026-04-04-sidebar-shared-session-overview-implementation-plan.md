# Sidebar Shared Session Overview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在线程树每一行增加统一的共享会话摘要，让用户在侧边栏中也能看到 owner 与 state，而不引入第二套列表或控制逻辑。

**Architecture:** 继续复用现有 `sharedSessionSnapshotByThreadId`，由 `App.vue` 将该映射传给 `SidebarThreadTree.vue`。线程树在线程标题下方按需展示一条只读副标题，格式为 `owner · state`，并与详情页顶部状态卡复用同一套状态文案。

**Tech Stack:** Vue 3、TypeScript、现有 `useDesktopState`、`node:test`、`npm run build`

---

### Task 1: 固定侧边栏镜像摘要边界

**Files:**
- Create: `docs/plans/2026-04-04-sidebar-shared-session-overview-implementation-plan.md`

**Step 1: 固定展示位置**

- 仅在线程树每一行里展示
- 不新增独立镜像分区
- 不新增第二套列表

**Step 2: 固定展示内容**

- 仅展示 `owner · state`
- 复用详情页状态卡现有文案映射
- 仅在有 shared snapshot 的线程上显示
- 如存在待处理授权数量，可追加短摘要 `N 条授权`

**Step 3: 固定只读边界**

- 不新增交互按钮
- 不新增筛选或跳转
- 不新增 takeover 或审批入口

### Task 2: 为线程树摘要接线写失败测试

**Files:**
- Create: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 写 SidebarThreadTree 测试**

- 断言组件新增 `sharedSessionSnapshotByThreadId` prop
- 断言线程行新增共享摘要容器
- 断言摘要格式为 `owner · state`

**Step 2: 写 App 接线测试**

- 断言 `App.vue` 将 `sharedSessionSnapshotByThreadId` 传入 `SidebarThreadTree`

**Step 3: 运行测试确认先失败**

Run: `node --test tests/sidebarSharedSessionOverview.test.mjs`
Expected: FAIL，提示缺少 prop、摘要结构或接线

### Task 3: 实现线程树共享摘要

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/sidebar/SidebarThreadTree.vue`
- Test: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 将 snapshot 映射传入线程树**

- 从 `useDesktopState` 取 `sharedSessionSnapshotByThreadId`
- 由 `App.vue` 透传给 `SidebarThreadTree`

**Step 2: 在线程行渲染摘要**

- 有 shared snapshot 时显示副标题
- 文案形如 `终端 · 等待处理`
- 强调 `needs_attention` 与 `failed`

**Step 3: 控制列表密度**

- 不额外增加卡片或标签组
- 尽量只占用线程行副标题位
- 无 snapshot 的线程保持现状

### Task 4: 回填与验证

**Files:**
- Modify: `docs/plans/2026-04-04-sidebar-shared-session-overview-implementation-plan.md`

**Step 1: 运行侧边栏摘要测试**

Run: `node --test tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 2: 运行共享快照相关测试**

Run: `node --test tests/sharedSessionStatusCard.test.mjs tests/sharedSessionUi.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 3: 运行全量测试**

Run: `node --test tests/*.mjs`
Expected: PASS

**Step 4: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 5: 回填执行结果**

- 记录实际接入位置
- 记录仍未实现的镜像总览能力

## 执行结果

### 已完成范围

- 已由 `App.vue` 将 `sharedSessionSnapshotByThreadId` 透传到线程树
- 已在 `SidebarThreadTree.vue` 的线程行中增加只读摘要
- 摘要统一格式为 `owner · state`
- 摘要仅在存在 shared snapshot 的线程上显示

### 实际实现边界

- 当前只在线程树行内展示，不新增独立镜像分区
- 当前基础摘要为 `owner · state`，当存在待处理授权时追加短摘要 `N 条授权`
- 当前未加入除待处理授权数量外的其他 attention 细节，也未加入跳转动作
- 线程行当前已改成主列 + 固定时间列布局，避免标题、副标题与时间互相遮挡
- 当前没有做镜像线程筛选、聚合总览或侧边栏顶部专题区

### 实际验证结果

- `node --test tests/sidebarSharedSessionOverview.test.mjs` 通过
- `node --test tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs` 通过
- `npm run build` 通过
