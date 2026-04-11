# Account Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `codex-web-local` 增加对标 codex app 的账号中心首版，使用户尤其在手机端可以查看当前账号状态、退出登录、重新登录和切换登录方式。

**Architecture:** 在现有线程状态之外新增独立的账号中心状态层，统一封装 `account/*` 与相关配置/额度 RPC；根布局新增一级账号入口和账号中心容器，手机端使用全屏 sheet 展示。首版只支持单活跃账号，但组件和状态模型为未来多账号快切预留扩展位。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Express bridge、Codex app-server RPC、现有 i18n 文案体系、Vite、tsup

---

## 背景与范围

- 现状：
  - `src/server/authMiddleware.ts` 只处理 Web 访问密码，不代表底层账号登录
  - `src/api/codexGateway.ts` 只消费了 `account/rateLimits/read`
  - `src/composables/useDesktopState.ts` 没有账号中心状态，也没有消费 `account/updated`、`account/login/completed`
  - `src/App.vue` 没有账号入口
- 本次范围：
  - 补齐账号 RPC 封装与通知消费
  - 新增账号中心状态层
  - 新增桌面/移动端账号入口与账号中心 UI
  - 打通 ChatGPT 与 API Key 的首版登录流
  - 更新相关计划文档
- 非目标：
  - 不实现多账号保存与秒切
  - 不调整 `documentation/app-server-schemas`
  - 不改 Web 访问密码逻辑
  - 不新增设置页路由

## 风险与回滚

- 风险：
  - ChatGPT OAuth 在手机浏览器中的跳转/回跳可能存在中断，需要清晰的等待态和重试态
  - `app-server` 若返回的账号态与通知时序不稳定，UI 可能短暂闪烁
  - 首版若把账号逻辑塞进现有线程状态，会提高回归风险
- 回滚方式：
  - 移除账号入口与账号中心组件
  - 移除新增账号状态层与 RPC 封装
  - 恢复到仅展示额度、无账号 UI 的现状

## 分步执行清单

### Task 1: 先把账号能力边界落到测试或源码约束

**Files:**
- Modify: `tests` 下现有适合做源码约束的测试文件；若仓库没有现成账号测试，可新增最小源码约束测试文件
- Test: `src/api/codexGateway.ts`
- Test: `src/composables/useDesktopState.ts`
- Test: `src/App.vue`

**Step 1: 增加账号 RPC 与入口的源码约束**

- 断言 `codexGateway` 新增：
  - `account/read`
  - `account/login/start`
  - `account/login/cancel`
  - `account/logout`
- 断言 `App.vue` 新增账号入口或账号中心挂载点。
- 断言状态层开始消费：
  - `account/updated`
  - `account/login/completed`

**Step 2: 运行相关测试并确认当前实现失败**

Run: `npm test -- --runInBand`

Expected: FAIL，且失败点来自账号能力尚未接入。

### Task 2: 在网关层补齐账号 RPC 封装

**Files:**
- Modify: `src/api/codexGateway.ts`
- Modify: `src/api/appServerDtos.ts`（仅当现有导出类型不足时）

**Step 1: 新增账号读写方法**

- 在 `codexGateway.ts` 中新增明确方法：
  - `getAccountStatus()`
  - `startAccountLogin()`
  - `cancelAccountLogin()`
  - `logoutAccount()`
  - `refreshAccountStatus()`
- 统一封装错误归一化，不在组件里直接写裸 `callRpc`。

**Step 2: 补齐需要的返回值归一化**

- 归一化 `GetAccountResponse`
- 归一化 `LoginAccountResponse`
- 保持对现有额度快照逻辑的兼容

**Step 3: 运行最小验证**

Run: `npm run build`

Expected: PASS，且 TypeScript 能识别新增导出。

### Task 3: 新增独立账号中心状态层

**Files:**
- Add: `src/composables/useAccountCenterState.ts`
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/types/codex.ts`（如需补 UI 状态类型）

**Step 1: 定义账号中心状态模型**

- 建立：
  - `accountStatus`
  - `currentAccount`
  - `authMode`
  - `requiresOpenaiAuth`
  - `rateLimitSnapshot`
  - `accountCenterOpen`
  - `accountCenterView`
  - `loginFlow`
  - `activeLoginId`
  - `pendingAuthUrl`

**Step 2: 接入初始化读取**

- 打开账号中心时并行读取：
  - `account/read`
  - `config/read`
  - `account/rateLimits/read`
- 把结果归一成首页四态：
  - `logged_in`
  - `logged_out`
  - `reauth_required`
  - `error`

**Step 3: 接入通知刷新**

- 消费：
  - `account/updated`
  - `account/login/completed`
  - `account/rateLimits/updated`
- 登录完成后自动刷新账号状态并关闭等待态。

### Task 4: 增加账号中心 UI 组件

**Files:**
- Add: `src/components/account/AccountCenterSheet.vue`
- Add: `src/components/account/AccountOverviewCard.vue`
- Add: `src/components/account/AccountLoginMethodPicker.vue`
- Add: `src/components/account/AccountLoginProgress.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 搭建账号中心容器**

- `AccountCenterSheet.vue` 负责：
  - 容器壳子
  - 桌面弹层 / 移动端全屏 sheet
  - 视图切换和关闭逻辑

**Step 2: 搭建首页与登录方式页**

- `AccountOverviewCard.vue` 展示：
  - 登录方式
  - 邮箱
  - plan
  - 主操作按钮
- `AccountLoginMethodPicker.vue` 展示：
  - `ChatGPT 登录`
  - `API Key 登录`

**Step 3: 搭建登录进度与失败页**

- `AccountLoginProgress.vue` 展示：
  - 正在打开授权页
  - 等待完成
  - 取消
  - 重试
  - 错误结果

**Step 4: 同步最小文案**

- 在 `uiText.ts` 增加账号中心所需的最小中英文本案。

### Task 5: 把账号中心接入根布局

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/layout/DesktopLayout.vue`（仅当布局需要额外 slot 或遮罩支持）

**Step 1: 新增一级账号入口**

- 桌面端：在侧栏底部新增账号按钮，位置高于主题/语言切换。
- 手机端：在 header 或当前移动端高频区域增加账号入口。

**Step 2: 在根组件挂载账号中心**

- 在 `App.vue` 中接入 `useAccountCenterState()`。
- 将 `AccountCenterSheet` 作为根级受控组件挂载。
- 首版不新增独立路由，继续使用现有 `home/thread` 结构。

### Task 6: 打通 ChatGPT 与 API Key 登录流

**Files:**
- Modify: `src/components/account/AccountCenterSheet.vue`
- Modify: `src/composables/useAccountCenterState.ts`

**Step 1: 接入 ChatGPT 登录流**

- 调用 `account/login/start`
- 若返回 `authUrl`：
  - 保存 `loginId`
  - 进入 `waiting_completion`
  - 提供“重新打开授权页”和“取消登录”

**Step 2: 接入 API Key 登录流**

- 增加最小表单页
- 提交后进入 loading
- 成功后回首页
- 失败后展示就地错误

**Step 3: 接入退出登录**

- 增加确认步骤
- 调用 `account/logout`
- 成功后刷新到 `logged_out`

### Task 7: 做移动端体验收口

**Files:**
- Modify: `src/components/account/AccountCenterSheet.vue`
- Modify: 账号中心相关样式文件或组件内样式

**Step 1: 做全屏 sheet**

- `<=720px` 使用全屏层
- 处理顶部/底部安全区
- 保证滚动区和底部操作区在 iPhone 上可用

**Step 2: 与现有移动端交互统一**

- 对齐现有底部面板的遮罩、圆角、关闭按钮、滚动体验
- 避免与现有移动端分支面板、状态面板样式冲突

**Step 3: 验证跳转后恢复**

- 关闭账号中心后再次打开，能从当前账号事实态恢复
- 登录等待态在收到结果后能自动更新

### Task 8: 同步文档与计划结果

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`（仅当运行说明需要补充手机端登录提示）
- Modify: `docs/plans/2026-04-12-account-center-design.md`
- Modify: `docs/plans/2026-04-12-account-center-implementation-plan.md`

**Step 1: 更新用户可见说明**

- 说明账号中心与 Web 访问密码的区别
- 说明手机端支持查看账号状态与重登
- 若 ChatGPT OAuth 有移动端注意事项，补最小说明

**Step 2: 回填计划执行结果**

- 在计划文档中补：
  - 实际修改文件
  - 验证命令
  - 偏差与后续待办

## 验收与验证

- 运行：`npm run build`
- 搜索：`rg -n "account/login/start|account/logout|account/read|account/login/completed|account/updated" src`
- 搜索：`rg -n "账号|Account Center|切换账号|重新登录|退出登录" src/i18n/uiText.ts src/components/account src/App.vue`
- 人工检查：
  - 桌面端存在一级账号入口
  - 手机端账号中心为全屏 sheet
  - 可以查看当前账号状态
  - 可以退出登录并重新发起登录

## Notes

- 本计划默认不执行 `git add` / `git commit`
- 若实现中发现需要新增 settings 路由，应先复核是否仍属于首版最小改动
- 若要做多账号快切，应另写设计与计划，明确账号仓库和安全边界

## 执行结果（2026-04-12）

### 实际修改文件
- `src/api/appServerDtos.ts`
- `src/api/codexGateway.ts`
- `src/types/codex.ts`
- `src/composables/useAccountCenterState.ts`
- `src/components/account/AccountCenterSheet.vue`
- `src/components/account/AccountOverviewCard.vue`
- `src/components/account/AccountLoginMethodPicker.vue`
- `src/components/account/AccountLoginProgress.vue`
- `src/components/icons/IconTablerUserCircle.vue`
- `src/i18n/uiText.ts`
- `src/App.vue`
- `tests/accountCenterUi.test.mjs`
- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`
- `docs/plans/2026-04-12-account-center-design.md`
- `docs/plans/2026-04-12-account-center-implementation-plan.md`

### 验证命令
- `node --test tests/accountCenterUi.test.mjs`
- `npm run build`
- `rg -n "account/login/start|account/logout|account/read|account/login/completed|account/updated" src`
- `rg -n "账号|Account Center|切换账号|重新登录|退出登录" src/i18n/uiText.ts src/components/account src/App.vue`

### 偏差与后续待办
- 仓库当前没有 `npm test` 脚本，因此 Task 1 的红灯验证改为 `node --test tests/accountCenterUi.test.mjs`。
- `useDesktopState.ts` 现有额度展示逻辑暂未迁移，首版账号中心与原额度状态并存，后续可再收敛为单一事实源。
- 尚未执行真实浏览器手工回归；当前以源码约束、检索和构建验证为主。
