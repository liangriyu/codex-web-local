# Branch Capability Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为当前共享工作区架构补充受限版分支切换与创建能力，并通过阻塞条件避免高风险操作。

**Architecture:** 在 bridge 层新增 Git 分支查询与操作接口，在状态层维护工作区级分支状态与阻塞条件，在 composer 中把当前分支 chip 升级为可交互菜单。所有能力均作用于当前 `cwd`，但只在工作区干净且无线程执行时允许操作。

**Tech Stack:** Vue 3、TypeScript、Express middleware、Node `execFile`、Git CLI

---

### Task 1: 定义分支数据模型

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 补充 UI 类型**

- 新增工作区分支状态类型、分支列表类型和阻塞原因类型。

**Step 2: 定义 API 返回结构**

- 在 `src/api/codexGateway.ts` 中定义 `fetchWorkspaceGitStatus`、`fetchWorkspaceBranches`、`switchWorkspaceBranch`、`createAndSwitchWorkspaceBranch` 所需类型。

### Task 2: 补充 bridge Git 分支接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 增加 Git 查询辅助函数**

- 封装当前分支、本地分支列表、dirty 状态读取。

**Step 2: 增加只读接口**

- 新增 `GET /codex-api/git/status`
- 新增 `GET /codex-api/git/branches`

**Step 3: 增加写接口**

- 新增 `POST /codex-api/git/branch/switch`
- 新增 `POST /codex-api/git/branch/create-and-switch`

**Step 4: 添加输入校验**

- 拒绝空分支名
- 拒绝明显非法分支名
- 非 git 工作区返回明确错误

### Task 3: 接入前端 API

**Files:**
- Modify: `src/api/codexGateway.ts`

**Step 1: 实现只读查询**

- 实现状态与分支列表请求函数。

**Step 2: 实现写操作**

- 实现切换分支和创建并切换分支函数。

**Step 3: 统一错误封装**

- 通过现有 `normalizeCodexApiError` 返回稳定错误信息。

### Task 4: 在状态层维护工作区级分支状态

**Files:**
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 增加分支状态存储**

- 增加当前工作区分支信息、可用分支、加载态、切换态、阻塞原因。

**Step 2: 增加阻塞规则**

- 工作区 dirty 时阻塞
- 当前线程 `inProgress` 时阻塞
- 当前线程有排队消息时阻塞

**Step 3: 增加刷新时机**

- 线程切换时刷新
- 成功切换/创建分支后刷新
- 需要时与 workspace diff 刷新联动

### Task 5: 将分支 chip 升级为菜单

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`

**Step 1: 把展示型 chip 改为按钮**

- 保留现有视觉风格，增加点击展开菜单能力。

**Step 2: 展示分支列表**

- 当前分支高亮
- 其他本地分支可点击切换

**Step 3: 展示新建分支入口**

- 提供输入框与提交按钮
- 成功后自动刷新菜单与当前分支展示

**Step 4: 展示阻塞原因**

- 不满足条件时禁用操作并给出原因

### Task 6: 刷新联动与验收

**Files:**
- Modify: `src/App.vue`
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 联动刷新**

- 切换分支后刷新线程列表、当前线程详情、workspace diff。

**Step 2: 构建验证**

- 运行 `npm run build`
- 记录结果

### Task 7: 文档收尾

**Files:**
- Modify: `docs/plans/2026-03-31-branch-capability-phase1-plan.md`

**Step 1: 补充执行结果**

- 实现完成后补充实际完成项、偏差、验证结果和后续待办。

### 风险与回滚

- 风险：共享工作区切分支会影响同一 `cwd` 下所有线程。
- 风险：阻塞规则不完整会导致边界状态下误切分支。
- 回滚：移除 Git 分支菜单与分支操作 API，恢复当前只读分支展示。

### 验收与验证命令

- 当前工作区干净且无线程执行时，允许切换已有本地分支。
- 当前工作区干净且无线程执行时，允许创建并切换到新分支。
- 工作区 dirty 或线程执行中时，明确阻塞。
- 验证命令：`npm run build`

## 执行结果

### 实际完成项

- 已在 bridge 层新增 Git 状态、分支列表、切换分支、创建并切换分支接口。
- 已在 `codexGateway` 中补充分支能力 API，并沿用现有错误封装方式。
- 已在状态层新增工作区级分支状态缓存、加载态、切换态，以及 dirty / 运行中线程 / 排队消息阻塞规则。
- 已将输入区分支 chip 升级为可交互菜单，支持查看本地分支、切换分支、创建并切换分支，并直接展示阻塞原因。
- 已在 `App.vue` 中接入刷新联动，分支操作成功后会刷新线程内容与工作区 diff 展示。

### 实际偏差

- 当前阻塞规则按“同一 `cwd` 下任一线程仍在执行或有排队消息”处理，比计划中的“当前线程”口径更严格，符合共享工作区安全边界。
- 当前阶段仍然是共享工作区模型，分支操作会影响同一 `cwd` 下所有线程，不包含 worktree 隔离能力。

### 验证结果

- 2026-03-31：执行 `npm run build` 通过。

### 后续待办

- 增加对 detached HEAD、merge/rebase 中间态的更明确提示。
- 评估是否需要把待处理审批请求也纳入阻塞条件。
- 如需对齐 Codex app 设计，后续应规划 worktree-aware 的工作区模型。

## 增量增强：审批请求阻塞分支切换

### 目标

- 当同一 `cwd` 下仍存在待处理审批请求时，禁止切换或创建并切换分支。

### 影响文件

- Modify: `src/types/codex.ts`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

### 实施步骤

1. 在工作区分支阻塞原因中新增 `pending_server_requests`。
2. 在状态层按“同一 `cwd` 下任一线程仍有待处理审批请求”加入阻塞判断。
3. 在分支菜单中新增对应的阻塞提示文案。
4. 运行 `npm run build` 验证。

### 增强结果

- 已新增 `pending_server_requests` 阻塞原因。
- 已在状态层按同一 `cwd` 聚合待处理审批请求，并阻塞分支切换 / 创建并切换。
- 已修正刷新页面后的漏拦截问题：全局作用域 `__global__` 下的待处理审批请求现在也会阻塞分支切换。
- 已在分支菜单中补充“有待处理的审批请求”提示文案。
- 2026-03-31：执行 `npm run build` 通过。
