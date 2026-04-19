# Shared App Server Session Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `codex-web-local` 增加“共享模式 / 独立模式”双模式基础设施，使共享模式可以连接同一个 `codex app-server` 并为会话强共享打下基础。

**Architecture:** 在现有 bridge 之上增加显式运行模式。共享模式优先连接已有 `codex app-server`，独立模式继续保留当前自启 `app-server` 与 profile 逻辑。共享模式引入最小 owner/只读状态，不再依赖 profile 文件复制来表达共享会话。第一阶段只实现可识别、可连接、可显示、可限制并发写入的 MVP，不追求完整多账号切换。

**Tech Stack:** Vue 3 + TypeScript、Express bridge、Node child_process、现有 codex RPC、Node test runner

---

### Task 1: 固化运行模式设计与配置入口

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/cli/runtimeConfig.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Test: `tests/runtimeConfig.test.mjs` 或仓库内对应 CLI 配置测试文件

**Step 1: Write the failing test**

- 为运行配置新增断言：
  - 支持显式 `shared` / `isolated` 模式
  - 默认值清晰可预测
  - 非法模式会报错
- 若当前没有对应测试文件，则创建 `tests/runtimeConfig.test.mjs`，最小断言 CLI 配置解析结果。

**Step 2: Run test to verify it fails**

Run: `node --test tests/runtimeConfig.test.mjs`
Expected: FAIL，提示缺少 `serverMode` 或配置校验未覆盖新字段。

**Step 3: Write minimal implementation**

- 在 `src/cli/runtimeConfig.ts` 增加 `serverMode`：
  - `shared`
  - `isolated`
- 在 `src/cli/index.ts` 增加最小 CLI 参数和帮助文案。
- 明确默认策略：
  - 推荐默认先尝试 `shared`
  - 失败时允许用户显式切到 `isolated`

**Step 4: Run test to verify it passes**

Run: `node --test tests/runtimeConfig.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/index.ts src/cli/runtimeConfig.ts tests/runtimeConfig.test.mjs README.md README.zh-CN.md docs/runtime/README.md
git commit -m "feat: 增加共享与独立运行模式配置"
```

### Task 2: 为 bridge 增加共享模式 attach 骨架

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/server/httpServer.ts`
- Test: `tests/codexAppServerBridge.test.mjs`

**Step 1: Write the failing test**

- 增加断言：
  - `shared` 模式不会直接走当前 profile 切换启动逻辑
  - `shared` 模式优先尝试 attach 到现有 `app-server`
  - attach 失败时返回明确状态，而不是静默回退到旧逻辑

**Step 2: Run test to verify it fails**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: FAIL，当前 bridge 只有自启模式。

**Step 3: Write minimal implementation**

- 在 bridge 中引入运行模式分支。
- 抽出“连接现有 server”与“spawn 新 server”两条路径。
- 第一版 attach 可先采用最小抽象接口，不必一次做完真实桌面发现：
  - `connectToExistingAppServer()`
  - `startEmbeddedAppServer()`
- `shared` 模式下禁止依赖 `ensureActiveProfileLoaded()` 作为身份来源。

**Step 4: Run test to verify it passes**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/codexAppServerBridge.ts src/server/httpServer.ts tests/codexAppServerBridge.test.mjs
git commit -m "feat: 为 bridge 增加共享模式 attach 骨架"
```

### Task 3: 共享模式下暴露运行模式与连接状态

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/App.vue`
- Test: `tests/accountCenterUi.test.mjs`

**Step 1: Write the failing test**

- 断言前端可读取并展示：
  - 当前运行模式
  - 是否连接共享 `app-server`
  - attach 失败时的降级提示

**Step 2: Run test to verify it fails**

Run: `node --test tests/accountCenterUi.test.mjs`
Expected: FAIL，当前 UI 没有模式概念。

**Step 3: Write minimal implementation**

- 在 gateway 和 types 中增加：
  - `serverConnectionMode`
  - `serverConnectionStatus`
- 在账号中心或全局状态区域展示：
  - `共享模式`
  - `独立模式`
  - `共享模式连接失败，当前未进入强共享`
- 不在这一任务实现复杂 UI，只做最小可见状态。

**Step 4: Run test to verify it passes**

Run: `node --test tests/accountCenterUi.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/codex.ts src/api/codexGateway.ts src/composables/useAccountCenterState.ts src/App.vue tests/accountCenterUi.test.mjs
git commit -m "feat: 展示共享模式连接状态"
```

### Task 4: 共享模式下禁用 profile 作为运行态账号源

**Files:**
- Modify: `src/server/accountProfileStore.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/components/account/AccountOverviewCard.vue`
- Modify: `src/components/account/AccountLoginMethodPicker.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/accountCenterUi.test.mjs`
- Test: `tests/accountProfilesServer.test.mjs`

**Step 1: Write the failing test**

- 增加断言：
  - `shared` 模式下不显示 profile 切换入口
  - `shared` 模式下切换账号动作不调用 profile switch 接口
  - `isolated` 模式仍保留现有 profile 能力

**Step 2: Run test to verify it fails**

Run: `node --test tests/accountCenterUi.test.mjs tests/accountProfilesServer.test.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**

- 共享模式下：
  - 隐藏 profile 入口
  - 停止把 profile 当成当前账号真相
  - 仅保留“这会影响共享 `codex app` 当前账号”的提示
- 独立模式下保留现有逻辑。

**Step 4: Run test to verify it passes**

Run: `node --test tests/accountCenterUi.test.mjs tests/accountProfilesServer.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/accountProfileStore.ts src/server/codexAppServerBridge.ts src/composables/useAccountCenterState.ts src/components/account/AccountOverviewCard.vue src/components/account/AccountLoginMethodPicker.vue src/i18n/uiText.ts tests/accountCenterUi.test.mjs tests/accountProfilesServer.test.mjs
git commit -m "feat: 共享模式下收敛账号来源"
```

### Task 5: 引入共享会话 owner 最小模型

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/App.vue`
- Test: `tests/sharedSessionOwnerUi.test.mjs`（若不存在则创建）

**Step 1: Write the failing test**

- 增加断言：
  - 会话存在 `owner`
  - 当 owner 为另一端且 turn 运行中时，当前端进入只读/禁止发送态
  - 提供“接管控制权”入口

**Step 2: Run test to verify it fails**

Run: `node --test tests/sharedSessionOwnerUi.test.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**

- 在前端状态模型中加入：
  - `sharedSessionOwner`
  - `sharedSessionState`
  - `canTakeOver`
- 第一版先把 owner 作为前后端透传状态，不必一次做完所有 server enforcement。
- UI 上：
  - 若当前不可写，禁用发送入口并展示原因
  - 提供“接管控制权”按钮壳子

**Step 4: Run test to verify it passes**

Run: `node --test tests/sharedSessionOwnerUi.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/codex.ts src/api/codexGateway.ts src/composables/useDesktopState.ts src/composables/useAccountCenterState.ts src/App.vue tests/sharedSessionOwnerUi.test.mjs
git commit -m "feat: 增加共享会话 owner 最小模型"
```

### Task 6: 共享模式下停用会话复制语义

**Files:**
- Modify: `src/server/accountProfileStore.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/accountProfilesServer.test.mjs`
- Test: `tests/codexAppServerBridge.test.mjs`

**Step 1: Write the failing test**

- 增加断言：
  - `shared` 模式下不会触发 `syncConversationArtifacts()`
  - `isolated` 模式继续保留现有复制语义

**Step 2: Run test to verify it fails**

Run: `node --test tests/accountProfilesServer.test.mjs tests/codexAppServerBridge.test.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**

- 为会话复制逻辑增加模式守卫。
- 共享模式下禁止通过 profile 复制维持会话延续。
- 独立模式不改行为。

**Step 4: Run test to verify it passes**

Run: `node --test tests/accountProfilesServer.test.mjs tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/accountProfileStore.ts src/server/codexAppServerBridge.ts tests/accountProfilesServer.test.mjs tests/codexAppServerBridge.test.mjs
git commit -m "refactor: 共享模式下停用会话复制"
```

### Task 7: 文档与总体验证

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/business/README.md`（如需补入口）
- Modify: `docs/contracts/README.md`（如新增共享模式私有接口）

**Step 1: 文档补充**

- 写清：
  - 共享模式与独立模式的语义区别
  - 共享模式目标是接近会话强共享
  - 独立模式不保证与桌面 `codex app` 会话强共享
  - 账号切换在共享模式下是全局动作

**Step 2: Run targeted tests**

Run: `node --test tests/runtimeConfig.test.mjs tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs tests/accountProfilesServer.test.mjs tests/sharedSessionOwnerUi.test.mjs`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add README.md README.zh-CN.md docs/runtime/README.md docs/business/README.md docs/contracts/README.md
git commit -m "docs: 补充共享模式与独立模式说明"
```
