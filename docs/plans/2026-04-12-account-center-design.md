# 账号中心设计

## 背景
- 当前 `codex-web-local` 只有服务访问密码页，用于保护 Web 入口，不等于底层 Codex/OpenAI 账号登录。
- 底层 `app-server` 协议已经暴露 `account/login/start`、`account/login/cancel`、`account/logout`、`account/read` 等能力，但当前前端没有账号入口，也没有消费相关通知。
- 现有移动端适配主要集中在会话输入区、分支面板和额度状态面板，尚未形成对标 codex app 的账号管理体验。

## 目标
- 增加对标 codex app 的一级“账号中心”入口。
- 支持在手机端查看当前账号状态、退出登录、重新登录和切换登录方式。
- 首版按“单活跃账号”交付，但页面结构和状态模型为未来“多账号快切”预留扩展位。
- 不改变现有 Web 访问密码逻辑，不混淆“访问服务”与“登录 OpenAI/Codex 账号”两类鉴权。

## 非目标
- 首版不实现已保存账号列表。
- 首版不实现多个账号之间的一键秒切。
- 首版不引入新的后端账号仓库或自定义 token 存储层。
- 不调整 `documentation/app-server-schemas` 目录结构或协议产物来源。

## 现状观察
### Web 访问密码
- `src/server/authMiddleware.ts` 当前提供的只是一个基于 cookie 的服务访问密码门禁。
- 该能力可用于手机端访问，但不具备账号身份、账号列表或登录方式切换语义。

### 底层账号能力
- `documentation/app-server-schemas/typescript/ClientRequest.ts` 已包含：
  - `account/login/start`
  - `account/login/cancel`
  - `account/logout`
  - `account/read`
- `documentation/app-server-schemas/typescript/v2/LoginAccountParams.ts` 表明登录方式支持：
  - `apiKey`
  - `chatgpt`
  - `chatgptAuthTokens`
- `documentation/app-server-schemas/typescript/v2/LoginAccountResponse.ts` 表明 ChatGPT 登录会返回 `loginId` 与 `authUrl`，适合由 Web 端拉起授权流。

### 前端差口
- `src/api/codexGateway.ts` 当前只消费了 `account/rateLimits/read`，用于额度展示。
- `src/composables/useDesktopState.ts` 只监听了 `account/rateLimits/updated`，没有监听 `account/updated`、`account/login/completed`。
- `src/router/index.ts` 当前只有 `home` 与 `thread` 两个路由。
- `src/App.vue` 侧栏底部仅提供主题和语言切换入口，没有账号入口。

## 设计原则
- 账号中心是一级能力，不作为普通设置项隐藏。
- `app-server` 账号状态是唯一事实源，Web 只负责展示、触发流程和消费结果。
- 手机端优先保证“查看状态、重新登录、退出登录”顺手可用。
- 首版尽量顺着现有协议做，不额外发明账号持久化体系。
- UI 和状态模型按未来多账号扩展设计，但首版只启用单活跃账号。

## 信息架构
### 一级入口
- 桌面端：在侧栏底部新增账号按钮，和主题/语言入口同区域，但视觉优先级更高。
- 手机端：在顶部 header 或输入区附近新增账号入口。
- 点击后统一打开“账号中心”全屏 sheet；桌面端可复用同一组件，以弹层或居中面板展示。

### 账号中心首页
- 顶部状态区：
  - 已登录
  - 未登录
  - 认证失效，需要重新认证
- 当前账号卡片：
  - 登录方式：`ChatGPT` / `API Key`
  - 邮箱
  - plan 类型
  - 可选显示 workspace 绑定提示
- 操作区：
  - `切换账号`
  - `退出登录`
  - `重新认证`
  - `切换登录方式`
- 说明区：
  - 明确这里操作的是底层 Codex/OpenAI 账号，而不是 Web 访问密码

### 登录方式页
- 首版提供两种登录方式：
  - `ChatGPT 登录`
  - `API Key 登录`
- 结构上预留未来“已保存账号卡片列表”的位置，但首版不展示。

## 交互流
### 进入账号中心
- 打开账号中心后，先显示 skeleton。
- 前端并行读取：
  - `account/read`
  - `config/read`
  - `account/rateLimits/read`
- 首页根据结果归一成四态：
  - `logged_in`
  - `logged_out`
  - `reauth_required`
  - `error`

### ChatGPT 登录流
- 用户在登录方式页选择 `ChatGPT`。
- 前端调用 `account/login/start`。
- 若返回 `authUrl`：
  - 手机端直接跳转外部浏览器或新页授权。
  - 当前账号中心进入 `waiting_completion` 状态。
  - 页面展示：
    - 已打开授权页
    - 授权完成后会自动刷新
    - `取消登录`
    - `重新打开授权页`
- 收到 `account/login/completed` 后：
  - 成功：刷新账号状态并回首页
  - 失败：留在结果页，展示错误并允许重试

### API Key 登录流
- 用户在登录方式页选择 `API Key`。
- 进入表单页，输入 key 后提交。
- 成功后返回账号首页。
- 失败时在当前页展示错误，不强制关闭账号中心。

### 退出与切换账号
- 点击 `退出登录` 时先二次确认。
- 成功后账号中心留在打开状态，并切到 `logged_out`。
- 点击 `切换账号` 时先进入“选择登录方式”页，而不是先立即登出，避免误操作导致用户掉线。

### 中断与恢复
- 若用户在登录进行中关闭账号中心，后台仍可继续等待通知。
- 下次再次打开账号中心时，应根据内存态或最近结果恢复到“等待中”或“最新状态”。

## 状态模型
- 新增独立账号中心状态层，不把账号流程散落在 `App.vue` 模板里。
- 首版建议包含：
  - `accountStatus`: `loading | logged_out | logged_in | reauth_required | error`
  - `currentAccount`
  - `authMode`
  - `requiresOpenaiAuth`
  - `rateLimitSnapshot`
  - `accountCenterOpen`
  - `accountCenterView`
  - `loginFlow`
  - `activeLoginId`
  - `pendingAuthUrl`
- `currentAccount` 首版至少包含：
  - `type`
  - `email`
  - `planType`
- `loginFlow` 首版至少包含：
  - `idle`
  - `selecting_method`
  - `opening_oauth`
  - `waiting_completion`
  - `api_key_form`
  - `success`
  - `failed`

## 组件拆分
- `AccountCenterSheet`
  - 账号中心容器
  - 负责全屏 sheet / 桌面弹层壳子、视图切换与关闭逻辑
- `AccountOverviewCard`
  - 展示当前账号摘要与主要操作
- `AccountLoginMethodPicker`
  - 选择 `ChatGPT` / `API Key`
  - 后续可扩成账号卡片列表
- `AccountLoginProgress`
  - 展示 OAuth 等待、取消、重试和失败结果

## 路由与入口策略
- 首版不新增独立 settings 路由，继续保持当前 `home/thread` 主结构。
- 账号中心以受控组件方式挂在根布局中，减少一次性路由改造成本。
- 若后续需要分享直达链接或更完整设置体系，再考虑增加 `/settings/account` 路由。

## 协议与数据流
- 前端新增封装调用：
  - `account/read`
  - `account/login/start`
  - `account/login/cancel`
  - `account/logout`
  - `account/rateLimits/read`
  - `config/read`
- 前端新增通知消费：
  - `account/updated`
  - `account/login/completed`
  - `account/rateLimits/updated`
- `app-server` 继续作为唯一事实源，不在 Web 层自行缓存多个账号 token。

## 移动端要求
- 账号中心在 `<=720px` 时使用全屏 sheet。
- 遵循 iPhone 安全区，底部和顶部留出 `env(safe-area-inset-*)`。
- OAuth 跳转后的回到 Web 行为要尽量无状态依赖；即使页面刷新，也应优先重读 `account/read` 恢复。
- 页面按钮尺寸、滚动区域和关闭手势风格与现有移动端底部面板保持一致。

## 风险
- `app-server` 当前只暴露“当前账号”语义，首版无法真正做到多账号秒切。
- 若 ChatGPT OAuth 在手机浏览器里被拦截或切到外部 app，账号中心需要明确提示并可重试。
- 若未来需要保存多个账号，必须重新设计 Web 层的账号仓库与安全边界。

## 演进路径
### Phase 1
- 交付单活跃账号版本：
  - 查看当前账号
  - ChatGPT / API Key 登录
  - 退出登录
  - 重新认证

### Phase 2
- 在不改变账号中心骨架的前提下，扩展“已保存账号卡片”。
- 通过额外的数据源支撑多账号快切。

## 实施落点（2026-04-12）
- 账号中心按“根布局受控 sheet”落地，没有新增 `/settings/account` 路由。
- 桌面端入口放在侧栏底部，移动端入口放在顶部 header。
- 状态层收敛到 `src/composables/useAccountCenterState.ts`，并消费：
  - `account/updated`
  - `account/login/completed`
  - `account/rateLimits/updated`
- ChatGPT 登录流采用 `window.open` 打开授权页；若弹窗被拦截，则回退到当前页跳转。
- 关闭账号中心不会主动取消登录等待态；再次打开时会基于内存态和 `account/read` 恢复。

## 验证
- 文档评审时确认：
  - 账号中心区分了 Web 访问密码和底层账号
  - 手机端完整覆盖查看、登录、退出、重登流程
  - 首版范围明确限制在单活跃账号
- 实施后至少执行：
  - `npm run build`
