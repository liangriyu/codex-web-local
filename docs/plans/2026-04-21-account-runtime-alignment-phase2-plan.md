# web-local 与 Codex App 账号对齐（Phase 2）Implementation Plan

**Goal:** 在保持现有 bridge 架构不变（仍由 web-local 拉起 app-server）的前提下，提供可视化且可一键触发的“账号对齐”路径，降低 web 与桌面账号分叉导致的误判与操作成本。

**Architecture:** 前端账号区新增“对齐账号”动作，调用 `account/login/start(type=chatgpt)` 获取 `authUrl` 并拉起浏览器授权；授权完成后刷新 `account/read` / 档案列表 / 额度快照。UI 持续显示“当前 Web 运行时”标识，明确账号来源语义。

**非目标:**
- 不修改 `documentation/app-server-schemas/`
- 不改 upstream app-server 协议
- 不在本阶段实现“复用桌面 Codex App 同一 app-server 进程”

## Task 1: 网关增加账号对齐登录启动能力

**Files:**
- Modify: `src/api/codexGateway.ts`
- Test: `tests/accountStateModel.test.mjs`

**Steps:**
1. 先写失败测试，断言网关存在 `startChatgptAccountLogin()`，内部调用 `account/login/start` 且参数为 `{ type: 'chatgpt' }`。
2. 实现最小方法并返回 `authUrl`。
3. 跑测试转绿。

## Task 2: 状态层接入“对齐账号”动作

**Files:**
- Modify: `src/composables/useDesktopState.ts`
- Test: `tests/accountStateModel.test.mjs`

**Steps:**
1. 先写失败测试，断言状态层暴露 `startAccountAlignment()`。
2. 实现动作：
   - 调用网关拿 `authUrl`
   - 返回 URL 给 UI
   - 失败时写入 `error`
3. 对齐成功后由现有刷新链路恢复账号/额度。
4. 跑测试转绿。

## Task 3: 账号区 UI 增加“一键对齐”入口

**Files:**
- Modify: `src/components/sidebar/SidebarAccountSwitcher.vue`
- Modify: `src/App.vue`
- Test: `tests/accountSwitcherUi.test.mjs`

**Steps:**
1. 先写失败测试，断言账号组件存在 `align` 事件与“对齐账号”入口。
2. 组件发出 `align` 事件；App 接收后调用状态层动作并 `window.open(authUrl, '_blank', 'noopener')`。
3. 授权后由用户刷新或轮询刷新加载最新账号。
4. 跑测试转绿。

## Task 4: 文档同步与验证

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`

**Steps:**
1. 增加“账号对齐”说明与限制（当前是运行时内对齐，不是复用桌面同进程）。
2. 运行验证：
   - `node --test tests/accountPrivateRpc.test.mjs tests/accountStateModel.test.mjs tests/accountSwitcherUi.test.mjs`
   - `npm run build`

## 验收标准

1. 账号区可直接触发 chatgpt 登录对齐流程。
2. 授权完成后刷新可看到 web 端账号切到目标账号。
3. UI 明确标识“当前 Web 运行时”语义，避免误解为天然桌面同进程共享。
4. 构建与相关测试通过。
