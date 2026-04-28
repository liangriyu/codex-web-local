# 多账号档案池与免回调切换 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `codex-web-local` 中实现多账号档案池、免回调切换、自动 token 刷新回填，并保持账号切换后会话体验接近原生 Codex app。

**Architecture:** 采用 `chatgptAuthTokens` 外部托管模式。在 bridge 层新增账号私有 RPC、档案存储、切换协调器与 refresh 自动应答；在前端新增账号中心与账号域状态恢复。切换动作通过事务化流程执行，失败时可回退到上一活跃账号并给出可恢复错误。

**Tech Stack:** Vue 3、TypeScript、Node `http` bridge、JSON-RPC、Node `node:test`、Vite、tsup、`CODEX_HOME` 本地持久化

---

## 背景与范围

- 背景：
  - 当前项目仅有 Web 访问密码会话，不具备 OpenAI 多账号档案池。
  - app-server 是“单活跃账号”模型，需由 host 扩展“账号池+切换”能力。
  - 协议已提供关键能力：`account/login/start(chatgptAuthTokens)` 与 `account/chatgptAuthTokens/refresh`。
- 本次范围：
  - 新增账号档案存储与活跃账号状态
  - 新增账号切换私有 RPC
  - 新增 refresh 自动应答（命中 `previousAccountId`）
  - 新增 Web/移动端账号切换 UI 与状态恢复
- 非目标：
  - 不修改 `documentation/app-server-schemas/`
  - 不改 upstream app-server 协议
  - 不实现“从未授权账号零授权入池”

## 设计原则

1. 已入池账号切换不走 OAuth 回调。
2. 账号明文 token 不进入前端持久化存储。
3. 切换过程串行化，禁止并发切换撕裂状态。
4. active turn 期间默认阻止切换（可选中断后再切换）。
5. 任何自动 refresh 失败都要可退化为“该账号需重新授权”。

## 风险与回滚

- 风险：
  - `chatgptAuthTokens` 为 UNSTABLE，升级后可能变更行为。
  - 档案池存储不当会带来凭据泄漏风险。
  - 多端并发切换可能造成活跃账号不一致。
- 回滚：
  - 关闭账号池特性开关 `CODEX_WEB_LOCAL_MULTI_ACCOUNT_ENABLED=0`
  - 前端隐藏账号切换 UI
  - bridge 回退到“仅透传 app-server 账号能力”

## 分步执行清单

### Task 1: 建立账号私有 RPC 与最小骨架

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/accountPrivateRpc.test.mjs`

**Step 1: 写失败测试（方法存在性与路由分发）**

```js
test('bridge exposes account private rpc methods', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')
  assert.match(bridge, /web-local\/account\/profiles\/list/)
  assert.match(bridge, /web-local\/account\/profiles\/switch/)
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountPrivateRpc.test.mjs`  
Expected: FAIL，提示私有方法不存在。

**Step 3: 最小实现**

```ts
const PRIVATE_ACCOUNT_PROFILES_LIST_METHOD = 'web-local/account/profiles/list'
const PRIVATE_ACCOUNT_PROFILES_SWITCH_METHOD = 'web-local/account/profiles/switch'
```

在 `handlePrivateRpc()` 中新增账号方法分发，先返回占位响应（`not_implemented`）。

**Step 4: 再跑测试**

Run: `node --test tests/accountPrivateRpc.test.mjs`  
Expected: PASS。

### Task 2: 新增账号档案存储层（服务端）

**Files:**
- Create: `src/server/accountProfileStore.ts`
- Test: `tests/accountProfileStore.test.mjs`

**Step 1: 写失败测试（读写、更新活跃账号、原子落盘）**

```js
test('account profile store persists and restores active profile', async () => {
  const store = createAccountProfileStore({ baseDir: tempDir })
  await store.upsertProfile({ profileId: 'p1', accountId: 'a1', provider: 'chatgptAuthTokens' })
  await store.setActiveProfile('p1')
  const snapshot = await store.readSnapshot()
  assert.equal(snapshot.activeProfileId, 'p1')
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountProfileStore.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- 落盘位置：`$CODEX_HOME/codex-web-local/account-profiles.json`
- 能力：
  - `listProfiles`
  - `upsertProfile`
  - `removeProfile`
  - `setActiveProfile`
  - `readSnapshot`
- 采用 `tmp + rename` 原子写。

**Step 4: 再跑测试**

Run: `node --test tests/accountProfileStore.test.mjs`  
Expected: PASS。

### Task 3: 新增 token broker 与 refresh 适配

**Files:**
- Create: `src/server/accountTokenBroker.ts`
- Test: `tests/accountTokenBroker.test.mjs`

**Step 1: 写失败测试（按 profileId 取可用 token；过期触发 refresh）**

```js
test('token broker refreshes expired token and returns access token payload', async () => {
  const broker = createAccountTokenBroker({ refresh: async () => ({ accessToken: 'new', chatgptAccountId: 'a1', chatgptPlanType: 'plus' }) })
  const result = await broker.getUsableAccessToken({ profileId: 'p1', expired: true })
  assert.equal(result.accessToken, 'new')
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountTokenBroker.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- `getUsableAccessToken(profile)`：
  - 未过期直接返回
  - 过期调用 refresh provider
- 返回结构：
  - `accessToken`
  - `chatgptAccountId`
  - `chatgptPlanType`

**Step 4: 再跑测试**

Run: `node --test tests/accountTokenBroker.test.mjs`  
Expected: PASS。

### Task 4: 实现账号切换协调器（事务化）

**Files:**
- Create: `src/server/accountSwitchCoordinator.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/accountSwitchCoordinator.test.mjs`

**Step 1: 写失败测试（切换调用 login/start；更新 activeProfile；失败回退）**

```js
test('switch coordinator logs into target profile and updates active profile', async () => {
  const result = await coordinator.switchTo('p2')
  assert.equal(result.activeProfileId, 'p2')
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountSwitchCoordinator.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- `switchTo(profileId)`：
  - 检查切换锁
  - 取 token payload
  - 调 `appServer.rpc('account/login/start', { type: 'chatgptAuthTokens', ... })`
  - 更新 `activeProfileId`
  - 失败时回滚 `activeProfileId` 并返回错误码

**Step 4: 再跑测试**

Run: `node --test tests/accountSwitchCoordinator.test.mjs`  
Expected: PASS。

### Task 5: 接入 refresh 自动应答（server request）

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/accountRefreshAutoResponse.test.mjs`

**Step 1: 写失败测试（收到 `account/chatgptAuthTokens/refresh` 自动应答）**

```js
test('bridge auto-resolves account/chatgptAuthTokens/refresh with profile token', async () => {
  appServer.handleServerRequest(99, 'account/chatgptAuthTokens/refresh', { reason: 'unauthorized', previousAccountId: 'a1' })
  const pending = appServer.listPendingServerRequests()
  assert.equal(pending.length, 0)
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountRefreshAutoResponse.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- 在 `handleServerRequest()` 优先分支：
  - 若方法为 `account/chatgptAuthTokens/refresh`
  - 依据 `previousAccountId` 匹配 profile
  - 调 broker 返回新 token
  - `sendServerRequestReply(id, { result: {...} })`
- 失败时退回原有 pending 流程（人工处理）。

**Step 4: 再跑测试**

Run: `node --test tests/accountRefreshAutoResponse.test.mjs`  
Expected: PASS。

### Task 6: 前端 API 与状态层接入账号域

**Files:**
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/types/codex.ts`
- Test: `tests/accountStateModel.test.mjs`

**Step 1: 写失败测试（可读取档案列表与执行切换）**

```js
test('desktop state can load account profiles and switch active profile', async () => {
  await state.loadAccountProfiles()
  await state.switchAccountProfile('p2')
  assert.equal(state.activeAccountProfileId.value, 'p2')
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountStateModel.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- `codexGateway` 增加：
  - `listAccountProfiles()`
  - `switchAccountProfile(profileId)`
- `useDesktopState` 增加：
  - `accountProfiles`
  - `activeAccountProfileId`
  - `loadAccountProfiles`
  - `switchAccountProfile`

**Step 4: 再跑测试**

Run: `node --test tests/accountStateModel.test.mjs`  
Expected: PASS。

### Task 7: UI 接入（桌面 + 手机）

**Files:**
- Create: `src/components/sidebar/SidebarAccountSwitcher.vue`
- Modify: `src/App.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/accountSwitcherUi.test.mjs`

**Step 1: 写失败测试（UI 出现账号切换入口）**

```js
test('app renders account switcher entry in sidebar', async () => {
  const app = await read('../src/App.vue')
  assert.match(app, /SidebarAccountSwitcher/)
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountSwitcherUi.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- 侧边栏增加账号切换组件。
- 移动端在现有底部操作区增加“账号”入口，复用同一数据源。
- 切换前如 `isSelectedThreadInProgress` 为真，提示先中断。

**Step 4: 再跑测试**

Run: `node --test tests/accountSwitcherUi.test.mjs`  
Expected: PASS。

### Task 8: 会话体验保持（按账号分桶恢复）

**Files:**
- Modify: `src/composables/desktop-state/storage.ts`
- Modify: `src/composables/useDesktopState.ts`
- Test: `tests/accountScopedUiStatePersistence.test.mjs`

**Step 1: 写失败测试（回切账号恢复线程选择与草稿）**

```js
test('ui state is restored per account profile', () => {
  // p1 选择 thread-a, p2 选择 thread-b
  // 切回 p1 后恢复 thread-a
})
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/accountScopedUiStatePersistence.test.mjs`  
Expected: FAIL。

**Step 3: 最小实现**

- 存储键从全局改为 `profileId` 分桶：
  - `selected-thread-id`
  - `scroll-state`
  - `context-usage`
- 切换账号后从对应分桶加载。

**Step 4: 再跑测试**

Run: `node --test tests/accountScopedUiStatePersistence.test.mjs`  
Expected: PASS。

### Task 9: 契约文档、运行文档与总体验证

**Files:**
- Modify: `docs/contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md`
- Modify: `docs/contracts/README.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`

**Step 1: 更新私有 RPC 文档**

- 增加 `web-local/account/*` 方法说明、参数、返回、错误码。

**Step 2: 同步运行文档与 README**

- 增加“多账号档案池能力与限制说明”。
- 明确“新账号首次入池仍需授权来源”。

**Step 3: 运行完整验证**

Run: `node --test tests/accountPrivateRpc.test.mjs tests/accountProfileStore.test.mjs tests/accountTokenBroker.test.mjs tests/accountSwitchCoordinator.test.mjs tests/accountRefreshAutoResponse.test.mjs tests/accountStateModel.test.mjs tests/accountSwitcherUi.test.mjs tests/accountScopedUiStatePersistence.test.mjs`  
Expected: 全部 PASS。

Run: `npm run build`  
Expected: PASS。

Run: `rg -n "web-local/account|account/chatgptAuthTokens/refresh|chatgptAuthTokens" src docs tests -S`  
Expected: 关键链路可检索。

## 验收标准

1. 已入池账号切换不触发 OAuth 回调。
2. 切换后 `account/read` 与配额信息反映目标账号。
3. `account/chatgptAuthTokens/refresh` 自动应答成功，失败可回退人工流程。
4. 回切账号可恢复该账号的线程与输入状态。
5. active turn 期间账号切换受守卫控制。
6. `npm run build` 通过。

## 执行说明

- 本仓库会话默认不执行 `git add` / `git commit`，由用户自行决定提交时机。
- 如需提交，提交信息请使用 Conventional Commits 且 `subject` 使用中文。

