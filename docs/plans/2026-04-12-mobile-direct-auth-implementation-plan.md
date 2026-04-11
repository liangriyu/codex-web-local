# Mobile Direct Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `codex-web-local` 增加基于 `PUBLIC_BASE_URL` 的手机端独立 ChatGPT 授权能力，并在公网入口不可用时自动回退到宿主机浏览器授权模式。

**Architecture:** 在 `codex-web-local` 的 HTTP 层新增移动端 OAuth 会话管理、状态查询和回调路由，使用短期内存态保存登录会话。前端账号中心读取服务能力后，自动在“手机端直登”和“宿主机代开”之间切换，继续以现有账号状态层为事实源。

**Tech Stack:** Vue 3、TypeScript、Express bridge、Codex app-server RPC、node:test、Vite、tsup

---

## 背景与范围

- 现状：
  - 手机端 ChatGPT 登录仍依赖宿主机浏览器处理 `localhost` 回调
  - 当前前端已经具备等待态和宿主机代开能力
  - 服务端尚无 `PUBLIC_BASE_URL` 配置与移动端 OAuth 回调入口
- 本次范围：
  - 新增 `PUBLIC_BASE_URL` 配置读取与校验
  - 新增移动端登录会话创建、状态查询、回调处理
  - 让账号中心按服务能力自动选择手机端直登或宿主机代开
  - 补充固定域名 / tunnel 运行文档
- 非目标：
  - 不引入独立 OAuth 中转服务
  - 不改 `documentation/app-server-schemas`
  - 不实现多账号或长期会话持久化

## 风险与回滚

- 风险：
  - tunnel 地址变化会让进行中的登录会话失效
  - 若回调状态与本地账号刷新时序处理不当，等待页可能停留在错误态
  - `PUBLIC_BASE_URL` 配置错误时，前端需要可靠回退而不是卡死
- 回滚方式：
  - 移除移动端 OAuth 会话路由和状态接口
  - 移除 `PUBLIC_BASE_URL` 能力分流
  - 保留当前宿主机浏览器代开方案

## 分步执行清单

### Task 1: 先写移动端直登能力的失败测试

**Files:**
- Add: `tests/mobileDirectAuthServer.test.mjs`
- Modify: `tests/accountCenterUi.test.mjs`
- Test: `src/server/codexAppServerBridge.ts`
- Test: `src/composables/useAccountCenterState.ts`

**Step 1: 写服务端能力约束测试**

- 断言服务端新增：
  - `PUBLIC_BASE_URL` 相关能力探测
  - `POST /api/auth/chatgpt/mobile/start`
  - `GET /api/auth/chatgpt/mobile/status`
  - `GET /auth/chatgpt/callback`
- 断言会话状态至少覆盖：
  - `pending`
  - `success`
  - `failed`
  - `expired`

**Step 2: 写前端分流约束测试**

- 断言 `useAccountCenterState.ts` 能根据服务能力在：
  - 手机端直登
  - 宿主机代开
  之间切换。

**Step 3: 运行测试并确认当前失败**

Run: `node --test tests/accountCenterUi.test.mjs tests/mobileDirectAuthServer.test.mjs`

Expected: FAIL，且失败点来自新接口和新状态尚未实现。

### Task 2: 增加 `PUBLIC_BASE_URL` 配置与能力暴露

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/types/codex.ts`（如需增加能力类型）

**Step 1: 在服务端读取并校验 `PUBLIC_BASE_URL`**

- 要求：
  - 必须是绝对 URL
  - 协议必须是 `https:`
  - 统一归一化末尾斜杠

**Step 2: 暴露前端可消费的能力信息**

- 新增最小能力读取方式，使前端能知道：
  - `mobileDirectAuthAvailable`
  - `publicBaseUrl` 是否存在

**Step 3: 运行最小验证**

Run: `node --test tests/mobileDirectAuthServer.test.mjs`

Expected: PASS，且非法配置不会误报为可用。

### Task 3: 实现移动端 OAuth 会话管理

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Add: `src/server/mobileAuthSessionStore.ts`（如拆分更清晰）
- Test: `tests/mobileDirectAuthServer.test.mjs`

**Step 1: 建立短期内存会话模型**

- 字段至少包含：
  - `loginSessionId`
  - `state`
  - `status`
  - `createdAt`
  - `expiresAt`
  - `publicBaseUrlSnapshot`
  - `appServerLoginId`
  - `error`

**Step 2: 实现会话创建与 TTL 清理**

- 创建登录会话时记录当前 `PUBLIC_BASE_URL`
- 过期会话自动清理

**Step 3: 实现状态读取**

- `GET /api/auth/chatgpt/mobile/status`
- 返回：
  - `pending`
  - `success`
  - `failed`
  - `expired`
  - `public_url_changed`
  - `server_restarted`

**Step 4: 运行验证**

Run: `node --test tests/mobileDirectAuthServer.test.mjs`

Expected: PASS，且过期和地址变化场景有明确结果。

### Task 4: 实现移动端登录发起接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexGateway.ts`
- Test: `tests/mobileDirectAuthServer.test.mjs`

**Step 1: 增加 `POST /api/auth/chatgpt/mobile/start`**

- 触发底层登录准备流程
- 创建登录会话
- 返回：
  - `loginSessionId`
  - `authUrl`
  - `expiresAt`

**Step 2: 保证 `authUrl` 基于当前 `PUBLIC_BASE_URL` 生成**

- 回调地址必须指向：
  - `/auth/chatgpt/callback`

**Step 3: 运行验证**

Run: `node --test tests/mobileDirectAuthServer.test.mjs`

Expected: PASS，且返回值能被前端直接消费。

### Task 5: 实现 OAuth 回调与幂等处理

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Test: `tests/mobileDirectAuthServer.test.mjs`

**Step 1: 实现 `GET /auth/chatgpt/callback`**

- 校验：
  - `state`
  - 会话存在
  - 会话未过期
- 处理成功与失败回调

**Step 2: 做幂等与异常分支**

- 重复回调不重复落账
- 缺少 `code/state` 直接失败
- 服务重启后的未知会话给出明确结果页

**Step 3: 运行验证**

Run: `node --test tests/mobileDirectAuthServer.test.mjs`

Expected: PASS，且重复回调与取消授权都有稳定表现。

### Task 6: 让前端账号中心按能力自动分流

**Files:**
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useAccountCenterState.ts`
- Modify: `src/types/codex.ts`
- Modify: `tests/accountCenterUi.test.mjs`

**Step 1: 封装移动端直登接口**

- 新增：
  - `startMobileChatgptLogin()`
  - `getMobileChatgptLoginStatus()`

**Step 2: 扩展账号状态机**

- 新增直登能力判断
- 等待态中轮询移动端登录结果
- 不可用时自动回退宿主机代开

**Step 3: 运行验证**

Run: `node --test tests/accountCenterUi.test.mjs tests/mobileDirectAuthServer.test.mjs`

Expected: PASS，且回退逻辑明确存在。

### Task 7: 收口等待态 UI 与文案

**Files:**
- Modify: `src/components/account/AccountCenterSheet.vue`
- Modify: `src/components/account/AccountLoginProgress.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 调整等待态文案**

- 直登可用时提示：
  - 在当前手机浏览器完成授权
- 回退时提示：
  - 将在宿主机浏览器中完成授权

**Step 2: 增加失败细分文案**

- 至少覆盖：
  - 用户取消
  - 服务重启
  - 公网地址变化
  - 回调失败

**Step 3: 运行最小验证**

Run: `node --test tests/accountCenterUi.test.mjs`

Expected: PASS，且关键文案键位齐全。

### Task 8: 同步运行文档与设计结果

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/plans/2026-04-12-mobile-direct-auth-design.md`
- Modify: `docs/plans/2026-04-12-mobile-direct-auth-implementation-plan.md`

**Step 1: 补充运行说明**

- 说明 `PUBLIC_BASE_URL` 的要求：
  - 手机可访问
  - 必须 HTTPS
  - 支持固定域名和 tunnel

**Step 2: 补充回退与限制说明**

- 说明：
  - 无公网入口时自动回退宿主机代开
  - tunnel 地址变化会让进行中的登录失效

**Step 3: 做最终验证**

Run: `npm run build`

Expected: PASS，且文档中的配置名与代码实现一致。

## 验收标准

- 配置了合法 `PUBLIC_BASE_URL` 后，手机端可独立打开 ChatGPT 授权页并完成闭环。
- 未配置或配置非法时，账号中心自动回退到宿主机浏览器代开，不出现死链。
- tunnel 地址变化、服务重启、重复回调都能得到明确反馈。
- 相关文档能指导固定域名和 tunnel 两类部署。

## 验证命令

- `node --test tests/accountCenterUi.test.mjs tests/mobileDirectAuthServer.test.mjs`
- `node --test tests/cliVoiceInputConfig.test.mjs`
- `npm run build`

## 本次实现结果（2026-04-12）

- 已完成：
  - `PUBLIC_BASE_URL` 读取、校验与配置透出
  - 移动端登录会话内存态与状态查询
  - `/api/auth/chatgpt/mobile/start`
  - `/api/auth/chatgpt/mobile/status`
  - `/auth/chatgpt/callback`
  - 账号中心按能力自动选择手机端直登或现有登录流
  - 运行文档同步
- 当前实现采用“公网回调 -> `codex-web-local` -> relay 回原始 loopback callback”的最小链路，不修改 `documentation/app-server-schemas`。
