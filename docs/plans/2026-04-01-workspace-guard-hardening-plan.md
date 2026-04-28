# 工作区守卫闭环与审批作用域收口 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐服务端分支守卫闭环，并把全局审批从 workspace blocker 中剥离成 session-level 语义。

**Architecture:** 在 bridge 层增加最小服务端 guard，确保分支切换接口无法绕过 dirty / approval 阻塞；在状态层把 `GLOBAL_SERVER_REQUEST_SCOPE` 从工作区审批集合中拆出，改为 session-level 提示。

**Tech Stack:** Vue 3、TypeScript、Express bridge、Git CLI、本地 persisted approval ledger

---

### Task 1: 为分支切换接口增加服务端 guard

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts`

**Step 1: 定义最小服务端 guard 结构**

- 新增 `ServerSideWorkspaceGuard`
- 支持：
  - `not_repo`
  - `workspace_dirty`
  - `pending_server_requests`
  - `persisted_server_requests`

**Step 2: 在 bridge 内实现 guard 计算函数**

- 复用现有：
  - `readWorkspaceGitStatus()`
  - `pendingServerRequests`
  - `persistedServerRequests`

**Step 3: 在切分支接口中先校验 guard**

- `/codex-api/git/branch/switch`
- `/codex-api/git/branch/create-and-switch`

若阻塞存在：
- 返回错误
- 包含结构化 blocked reasons

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 2: 将全局审批从工作区 blocker 中剥离

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/composables/useDesktopState.ts`
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/types/codex.ts`

**Step 1: 新增 session-level global approvals 选择器**

- `globalLiveServerRequests`
- `globalPersistedServerRequests`

**Step 2: 调整工作区审批聚合函数**

修改：
- `hasPendingServerRequestsInWorkspace()`
- `countLiveServerRequestsInWorkspace()`
- `listPersistedServerRequestsForWorkspace()`
- `listLiveServerRequestsForWorkspace()`

要求：
- 不再无条件并入 `GLOBAL_SERVER_REQUEST_SCOPE`

**Step 3: 保持 `WorkspaceModel.approvals` 只承接当前 `cwd` 的审批记录**

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 3: 调整分支菜单展示语义

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/ThreadComposer.vue`
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/App.vue`
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/i18n/uiText.ts`

**Step 1: 分支菜单只展示当前工作区相关审批**

- persisted records 列表只显示 workspace-level 数据
- blocker summary 不再因为 global requests 直接标记当前工作区阻塞

**Step 2: 为全局审批增加 session-level 提示**

- 可先做轻提示
- 不做复杂新面板

**Step 3: 补对应文案**

- 区分：
  - 当前工作区审批阻塞
  - 当前会话全局审批提示

**Step 4: 运行构建验证**

Run: `npm run build`  
Expected: PASS

### Task 4: 回填文档与补验收说明

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/docs/plans/2026-04-01-workspace-guard-hardening-design.md`
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/docs/plans/2026-04-01-workspace-guard-hardening-plan.md`

**Step 1: 回填最终 guard 规则**

- 哪些 blocker 已下沉到服务端
- 哪些 blocker 仍停留在前端

**Step 2: 回填审批作用域语义**

- workspace-level
- session-level

**Step 3: 运行构建验证**

Run: `npm run build`  
Expected: PASS

