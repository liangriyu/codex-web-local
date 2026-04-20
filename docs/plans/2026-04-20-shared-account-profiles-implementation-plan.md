# Shared 模式账号档案 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `shared` 模式增加“切换已有账号档案 + 新建档案登录并立即切换桌面账号”的能力，同时保持线程与会话库仍跟随桌面当前 shared 会话库。

**Architecture:** 继续复用 `AccountProfileStore` 管理账号档案，但在 `shared` 模式下把 profile 目录仅作为账号材料容器。`CodexAppServerBridge` 负责把目标 profile 的 `auth.json` 原子写回桌面 home，并清理账号 fallback 缓存后立即重读账号状态；线程相关 RPC 仍维持现有 shared/sidecar 数据源，不切换到 profile 的 `codexHomeDir`。

**Tech Stack:** Vue 3 + TypeScript、Node 文件系统 API、Express bridge、codex JSON-RPC、Node test runner

---

### Task 1: 固化 shared 模式账号档案的目标行为

**Files:**
- Modify: `tests/codexAppServerBridge.test.mjs`
- Modify: `tests/accountCenterUi.test.mjs`
- Reference: `src/server/codexAppServerBridge.ts`
- Reference: `src/composables/useAccountCenterState.ts`

**Step 1: Write the failing tests**

- 在 `tests/codexAppServerBridge.test.mjs` 增加断言：
  - shared 模式切已有档案时，会覆盖桌面 home 的 `auth.json`
  - shared 模式切已有档案时，不会把线程读取 home 切到目标 profile 目录
  - shared 模式创建新档案并登录完成后，会把新档案 `auth.json` 同步到桌面 home
- 在 `tests/accountCenterUi.test.mjs` 增加断言：
  - shared 模式显示档案列表
  - shared 模式不再报“共享模式下不支持切换账号档案”
  - shared 模式显示“新建档案并登录”入口

**Step 2: Run tests to verify they fail**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs`
Expected: FAIL，当前 shared 模式仍隐藏档案列表，并拒绝切换档案。

**Step 3: Write minimal implementation notes**

- 先不要改生产代码。
- 确认失败原因分别来自：
  - `supportsAccountProfiles` 只允许 isolated
  - `showProfileList` 只允许 isolated
  - `switchAccountProfile()` 在 shared 模式直接返回错误

**Step 4: Re-run the same tests**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs`
Expected: 仍然 FAIL，证明测试命中了新行为而不是既有行为。

**Step 5: Commit**

```bash
git add tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs
git commit -m "test: 固化共享模式账号档案行为"
```

### Task 2: 拆开 shared 模式下“账号档案切换”和“会话 home 切换”

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/codexAppServerBridge.test.mjs`

**Step 1: Write the failing bridge test**

- 为 shared 模式补一条精确断言：
  - 调用 `switchAccountProfile(profileId)` 后，`getCurrentCodexHomeDir()` 或线程读取链路仍指向桌面当前 shared 数据源，而不是目标 profile `codexHomeDir`

**Step 2: Run test to verify it fails**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: FAIL，当前 `switchAccountProfile()` 会调用 `setActiveCodexHomeDir(profile.codexHomeDir)`。

**Step 3: Write minimal implementation**

- 修改 `src/server/codexAppServerBridge.ts`：
  - shared 模式下的 `switchAccountProfile()` 不再调用 `setActiveCodexHomeDir(profile.codexHomeDir)`
  - isolated 模式保留现有行为
- 保持其他逻辑不变，先只拆开语义。

**Step 4: Run test to verify it passes**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/codexAppServerBridge.ts tests/codexAppServerBridge.test.mjs
git commit -m "refactor: 分离共享模式账号切换与会话 home 切换"
```

### Task 3: 实现桌面账号材料原子同步

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Optional Reference: `src/server/desktopAppServerDiscovery.ts`
- Test: `tests/codexAppServerBridge.test.mjs`

**Step 1: Write the failing test**

- 增加断言：
  - shared 模式切已有档案后，桌面 home 的 `auth.json` 内容等于目标 profile 的 `auth.json`
  - 目标 profile 缺失 `auth.json` 时切换失败并返回明确错误

**Step 2: Run test to verify it fails**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: FAIL，当前 shared 切档案不会写回桌面 `auth.json`。

**Step 3: Write minimal implementation**

- 在 `src/server/codexAppServerBridge.ts` 新增一个内部辅助流程，例如：
  - 读取 profile `auth.json`
  - 写入桌面 `getDesktopCodexHomeDir()/auth.json.tmp`
  - `rename()` 覆盖到桌面 `auth.json`
- 缺失源文件时抛出明确错误。

**Step 4: Run test to verify it passes**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/codexAppServerBridge.ts tests/codexAppServerBridge.test.mjs
git commit -m "feat: 共享模式切档案时同步桌面账号材料"
```

### Task 4: 切档案后立即刷新 shared 账号状态

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Test: `tests/codexAppServerBridge.test.mjs`
- Test: `tests/accountCenterUi.test.mjs`

**Step 1: Write the failing tests**

- bridge 测试增加断言：
  - shared 模式切档案后会清理只读 sidecar fallback
  - 后续 `account/read` 返回的是新账号
- UI 测试增加断言：
  - 点击切档案后，概览卡会显示新账号邮箱

**Step 2: Run tests to verify they fail**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs`
Expected: FAIL，当前 shared 切档案后不会主动刷新桌面账号状态。

**Step 3: Write minimal implementation**

- 在 shared 模式切档案成功后：
  - 释放只读 fallback app-server
  - 清理当前账号读取依赖的缓存状态
- 在前端切档案成功后：
  - 直接触发 `refreshBootstrap({ refreshToken: true })`
  - 保持账号中心停留在 overview

**Step 4: Run tests to verify they pass**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/codexAppServerBridge.ts src/api/codexGateway.ts src/composables/useAccountCenterState.ts tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs
git commit -m "feat: 共享模式切档案后立即刷新桌面账号状态"
```

### Task 5: 放开 shared 模式的档案列表和切换入口

**Files:**
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/components/account/AccountOverviewCard.vue`
- Modify: `src/components/account/AccountCenterSheet.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/accountCenterUi.test.mjs`

**Step 1: Write the failing UI test**

- 增加断言：
  - shared 模式显示档案列表
  - shared 模式的档案项可点击切换
  - shared 模式保留风险提示文案：会影响桌面 Codex.app 当前账号，但不切换会话历史

**Step 2: Run test to verify it fails**

Run: `node --test tests/accountCenterUi.test.mjs`
Expected: FAIL，当前 `showProfileList` 和新建档案入口仍被 `serverConnectionMode === 'isolated'` 限制。

**Step 3: Write minimal implementation**

- 修改 `supportsAccountProfiles` 的判断，使 shared 模式也支持账号档案能力。
- 调整 `AccountOverviewCard.vue`：
  - `showProfileList` 不再只限 isolated
  - shared 模式下继续允许点击切换
- 更新文案，说明 shared 仅切账号不切会话库。

**Step 4: Run test to verify it passes**

Run: `node --test tests/accountCenterUi.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/composables/useAccountCenterState.ts src/components/account/AccountOverviewCard.vue src/components/account/AccountCenterSheet.vue src/i18n/uiText.ts tests/accountCenterUi.test.mjs
git commit -m "feat: 共享模式开放账号档案列表与切换入口"
```

### Task 6: 支持 shared 模式新建档案并登录

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/components/account/AccountOverviewCard.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/codexAppServerBridge.test.mjs`
- Test: `tests/accountCenterUi.test.mjs`

**Step 1: Write the failing tests**

- bridge 测试增加断言：
  - shared 模式创建 profile 后启动登录，登录成功完成时会把该 profile 的 `auth.json` 同步到桌面 home
- UI 测试增加断言：
  - shared 模式显示“新建档案并登录”按钮
  - 按钮触发后不会再因为 shared 模式被拒绝

**Step 2: Run tests to verify they fail**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs`
Expected: FAIL，当前 shared 模式没有开放这条入口，且登录完成后不会同步桌面账号。

**Step 3: Write minimal implementation**

- shared 模式下允许 `createAndSwitchAccountProfile()`。
- 登录完成通知到达后，如果当前是 shared 模式且登录发生在新建 profile 上：
  - 将该 profile 的 `auth.json` 同步到桌面 home
  - 刷新账号中心状态

**Step 4: Run tests to verify they pass**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/codexAppServerBridge.ts src/composables/useAccountCenterState.ts src/components/account/AccountOverviewCard.vue src/i18n/uiText.ts tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs
git commit -m "feat: 共享模式支持新建档案并登录"
```

### Task 7: 回归验证 shared 线程语义未被破坏

**Files:**
- Modify: `tests/codexAppServerBridge.test.mjs`
- Optional Reference: `tests/accountProfilesServer.test.mjs`

**Step 1: Write the failing regression test**

- 增加断言：
  - shared 模式切档案后，`thread/list` 仍来自桌面 shared / sidecar 数据源
  - 不会切去目标 profile 的 `session_index.jsonl` 或 `state_5.sqlite`

**Step 2: Run test to verify it fails**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: FAIL，如果实现误把线程读取 home 切到了 profile 目录。

**Step 3: Write minimal implementation**

- 只在必要处修正线程读取路径，确保始终沿用桌面 shared 语义。
- 不额外重构无关逻辑。

**Step 4: Run test to verify it passes**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/codexAppServerBridge.test.mjs src/server/codexAppServerBridge.ts
git commit -m "test: 保护共享模式线程数据源语义"
```

### Task 8: 全量验证与文档同步

**Files:**
- Modify: `docs/plans/2026-04-20-shared-account-profiles-design.md`
- Modify: `docs/plans/2026-04-20-shared-account-profiles-implementation-plan.md`
- Optional Modify: `README.md`
- Optional Modify: `README.zh-CN.md`
- Optional Modify: `docs/runtime/README.md`

**Step 1: Run targeted tests**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/accountCenterUi.test.mjs tests/accountProfilesServer.test.mjs`
Expected: PASS

**Step 2: Run broader regression tests**

Run: `node --test tests/httpServerStaticDotfiles.test.mjs tests/desktopAppServerDiscovery.test.mjs`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Update docs if behavior copy changed**

- 如果 UI 或 shared 语义与本计划描述有偏差，回写到这两份计划文档。
- 如果外部启动/使用方式有变化，再补 `README.md`、`README.zh-CN.md`、`docs/runtime/README.md`。

**Step 5: Commit**

```bash
git add docs/plans/2026-04-20-shared-account-profiles-design.md docs/plans/2026-04-20-shared-account-profiles-implementation-plan.md README.md README.zh-CN.md docs/runtime/README.md
git commit -m "docs: 同步共享模式账号档案方案与验证结果"
```
