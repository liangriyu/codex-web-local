# 账号切换保持 Codex App 登录态（B 方案）Implementation Plan

**Goal:** 在现有 `chatgptAuthTokens` 账号池能力基础上，引入“档案级 managed token 保留与优先回写”，使 Web 端切换账号后尽量不触发 Codex App 重新登录。

**Architecture:** 保持现有切换入口不变（仍通过 `account/login/start(type=chatgptAuthTokens)` 执行运行时切换），新增档案内部双轨凭据模型：
- `tokenPayload`：外部托管 token（当前实现）
- `managedTokenPayload`：从 `auth.json` 捕获的 managed 登录态 token（`id/access/refresh/account_id`）

切换后回写 `auth.json` 时优先写 `managedTokenPayload`（`auth_mode=chatgpt`）；缺失时回退写 `tokenPayload`（`auth_mode=chatgptAuthTokens`）。

## 非目标

- 不修改 `documentation/app-server-schemas/`
- 不改 upstream `app-server` 协议
- 不引入新 UI 交互（仅后端切换语义与持久化增强）

## Task 1: 扩展账号档案模型与持久化迁移

**Files:**
- Modify: `src/server/accountProfileStore.ts`
- Modify: `tests/accountProfileStore.test.mjs`

**Steps:**
1. 为 `AccountProfile` 增加 `managedTokenPayload` 字段，兼容旧快照读写。
2. 在 legacy 迁移路径中，从 `auth.json` 解析并保留 managed token（若存在）。
3. 新增/更新测试覆盖：
   - 旧结构可迁移
   - `managedTokenPayload` 能持久化和恢复

## Task 2: 运行时同步阶段补齐 managed token 采集

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Steps:**
1. 扩展当前 runtime auth 读取逻辑，除 `access/account_id` 外同时读取 `id_token`、`refresh_token`、`auth_mode`。
2. 在 `syncCurrentRuntimeAccountProfile()` 中将 managed token 写入对应档案（存在时）。
3. 保持 `tokenPayload` 现有行为不变，避免破坏当前切换链路。

## Task 3: 切换后 auth.json 回写策略改为 managed 优先

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `tests/accountPrivateRpc.test.mjs`

**Steps:**
1. 修改 `syncCodexAuthFileWithActiveProfile()`：
   - 若档案有 `managedTokenPayload`，写 `auth_mode: chatgpt` 与完整 tokens。
   - 否则回退到 `chatgptAuthTokens` 写法。
2. 保留原有跨账号安全边界（不混用不同账号 token 字段）。
3. 更新源码回归测试断言，覆盖 managed 优先语义。

## 验证清单

1. `node --test tests/accountProfileStore.test.mjs tests/accountPrivateRpc.test.mjs`
2. `node --test tests/accountSwitchCoordinator.test.mjs tests/accountRefreshAutoResponse.test.mjs tests/accountStateModel.test.mjs tests/accountSwitcherUi.test.mjs`
3. `npm run build`

## 回滚策略

1. 回滚 `accountProfileStore` 新字段与 bridge 回写逻辑到旧版本。
2. 保持 `tokenPayload` 单轨模型与 `auth_mode=chatgptAuthTokens` 行为。
3. 重新执行账号相关测试与构建验证。
