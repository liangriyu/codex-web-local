# 账号授权回退与多账号切换 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 回退并清理 `PUBLIC_BASE_URL` 手机直登链路；手机端禁用授权登录，仅允许账号切换；电脑端支持多账号登录与管理。

**Architecture:** 采用“账号配置档案（profile）+ 单活跃 app-server 进程切换”的方案。每个 profile 绑定独立 `CODEX_HOME` 子目录，电脑端在当前 profile 完成登录后可保存并新增 profile；切换 profile 时服务端重启底层 `codex app-server` 到对应目录。手机端仅展示 profile 切换，不提供登录入口，避免移动端 OAuth 失败。

**Tech Stack:** Vue 3 + TypeScript、Express bridge、Node child_process、现有 codex RPC。

---

### Task 1: 移除 `PUBLIC_BASE_URL`/移动直登能力

**Files:**
- Modify: `src/cli/runtimeConfig.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Delete: `src/server/mobileAuthSessionStore.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/types/codex.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `tests/mobileDirectAuthServer.test.mjs`
- Modify: `tests/accountCenterUi.test.mjs`

**Step 1: 写失败测试（确保不再暴露 mobile auth 路由与配置键）**
- 在 `tests/mobileDirectAuthServer.test.mjs` 改为断言不存在 `/api/auth/chatgpt/mobile/*` 与 `/auth/chatgpt/callback` 相关文本。

**Step 2: 运行测试确保失败**
- Run: `node --test tests/mobileDirectAuthServer.test.mjs`
- Expected: FAIL（因为当前仍存在 mobile auth 逻辑）

**Step 3: 最小实现删除逻辑**
- 从 `runtimeConfig` 移除 `publicBaseUrl` 解析与校验。
- 从 bridge 移除：`publicBaseUrl` 字段、`withWebLocalConfigSnapshot` 注入键、三条 mobile auth HTTP 路由、以及 `MobileAuthSessionStore` 依赖。
- 前端 gateway/types/composable 移除 mobile start/status API 与状态轮询。

**Step 4: 运行测试确保通过**
- Run: `node --test tests/mobileDirectAuthServer.test.mjs tests/accountCenterUi.test.mjs`
- Expected: PASS

### Task 2: 引入账号 Profile 存储与切换（服务端）

**Files:**
- Create: `src/server/accountProfileStore.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/server/httpServer.ts`
- Test: `tests/accountProfilesServer.test.mjs`

**Step 1: 写失败测试**
- 增加 `tests/accountProfilesServer.test.mjs`，断言存在 profile 列表/创建/切换路由与基本数据结构。

**Step 2: 运行测试确保失败**
- Run: `node --test tests/accountProfilesServer.test.mjs`
- Expected: FAIL（路由和 store 未实现）

**Step 3: 最小实现**
- `accountProfileStore.ts`：
  - 字段：`id/name/codexHomeDir/createdAt/updatedAt/lastUsedAt`。
  - 存储到 `~/.codex/codex-web-local/account-profiles.json`。
  - 提供 `list/create/read/setActive`。
- bridge：
  - `AppServerProcess.start()` 支持按 active profile 注入 `CODEX_HOME`。
  - 新增 `switchActiveProfile(profileId)`：停止当前 app-server、清理 pending、重启到新 profile。
  - 新增路由：
    - `GET /codex-api/account-profiles`
    - `POST /codex-api/account-profiles`
    - `POST /codex-api/account-profiles/switch`

**Step 4: 运行测试确保通过**
- Run: `node --test tests/accountProfilesServer.test.mjs`
- Expected: PASS

### Task 3: 前端账号中心支持 Profile 管理与切换

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/components/account/AccountCenterSheet.vue`
- Modify: `src/components/account/AccountOverviewCard.vue`
- Modify: `src/components/account/AccountLoginMethodPicker.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/accountCenterUi.test.mjs`

**Step 1: 写失败测试**
- 断言 composable 暴露 `profiles/activeProfileId/switchProfile/createProfile`。
- 断言账号中心模板包含 profile 切换动作入口。

**Step 2: 运行测试确保失败**
- Run: `node --test tests/accountCenterUi.test.mjs`
- Expected: FAIL

**Step 3: 最小实现**
- gateway 增加 profile 三个接口封装。
- composable 启动时加载 profile 列表；切换调用 server switch 接口后刷新 `account/read`。
- 电脑端在登录方式页新增“新建并登录账号 profile”入口（先创建 profile，再切换，再走登录）。

**Step 4: 测试通过**
- Run: `node --test tests/accountCenterUi.test.mjs`
- Expected: PASS

### Task 4: 手机端禁用登录动作，仅保留切换

**Files:**
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/components/account/AccountLoginMethodPicker.vue`
- Modify: `src/components/account/AccountOverviewCard.vue`
- Modify: `src/App.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/accountCenterUi.test.mjs`

**Step 1: 写失败测试**
- 增加断言：存在移动端检测 + 登录动作禁用文案/逻辑。

**Step 2: 运行测试确保失败**
- Run: `node --test tests/accountCenterUi.test.mjs`
- Expected: FAIL

**Step 3: 最小实现**
- 前端检测 `window.matchMedia('(max-width: 720px)')`（或现有等价断点）。
- 手机端：
  - 隐藏 `start-chatgpt-login` 与 API Key 提交入口。
  - 显示“请在电脑端添加账号，手机端仅切换”的提示。
- overview 仅保留“切换账号 profile/刷新”动作。

**Step 4: 测试通过**
- Run: `node --test tests/accountCenterUi.test.mjs`
- Expected: PASS

### Task 5: 文档与总体验证

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/contracts/README.md`（如涉及私有接口索引）

**Step 1: 文档回退与新行为说明**
- 删除/替换 PUBLIC_BASE_URL 手机直登说明。
- 新增“桌面端管理账号 profile、手机端仅切换”说明。

**Step 2: 全量验证**
- Run: `node --test tests/accountCenterUi.test.mjs tests/mobileDirectAuthServer.test.mjs tests/accountProfilesServer.test.mjs`
- Run: `npm run build`
- Expected: 全部通过。

