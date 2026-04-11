# 手机端独立授权设计

## 背景
- 当前账号中心首版的 ChatGPT 登录依赖 `app-server` 返回的本地回调地址，实质上需要在运行 `codex-web-local` 的宿主机浏览器里完成授权。
- 手机浏览器直接打开 `localhost` 回调地址时，只会访问手机自身的本地端口，无法回到宿主机上的登录流程。
- 现有“宿主机代开授权页”可以兜底，但不能满足“全程在手机端完成授权”的目标。

## 目标
- 支持用户在手机浏览器内独立完成 ChatGPT OAuth 授权，不依赖宿主机浏览器代开。
- 保持 `codex-web-local` 作为当前账号状态的事实源，不新增独立账号中心或长期 token 仓库。
- 同时兼容固定正式域名和 tunnel 这类临时 HTTPS 域名。
- 当公网入口不可用时，账号中心自动回退到现有的宿主机浏览器授权模式。

## 非目标
- 不改造 `documentation/app-server-schemas` 与通用 `app-server` 协议产物。
- 不新增多账号存储与快切能力。
- 不在首版引入独立的 OAuth 中转服务。
- 不改变现有 Web 访问密码逻辑。

## 方案对比

### 方案 A：公网回调直接落到当前 `codex-web-local`
- 通过 `PUBLIC_BASE_URL` 为当前服务声明手机可访问的 HTTPS 外部地址。
- 移动端登录会话、OAuth 回调处理和结果查询都由当前 `codex-web-local` 承担。
- 优点是改造范围小，状态仍集中在当前实例；缺点是依赖外部 HTTPS 入口的稳定性。

### 方案 B：独立 OAuth 中转服务
- 回调统一落到独立服务，再由 `codex-web-local` 主动取回结果。
- 优点是长期扩展性更好；缺点是引入新服务和新安全边界，超出本次最小落地范围。

### 结论
- 本次采用方案 A，先以最小改动打通手机端独立授权。

## 设计原则
- 账号状态仍以当前 `codex-web-local` 实例为唯一事实源。
- `PUBLIC_BASE_URL` 作为运行时能力开关，不存在或非法时自动回退宿主机授权模式。
- 移动端授权中间态只保留短期内存态，不落长期持久化。
- 固定正式域名与 tunnel 走同一套逻辑，只通过 `PUBLIC_BASE_URL` 的当前值区分。

## 配置与运行方式

### `PUBLIC_BASE_URL`
- 新增运行时配置 `PUBLIC_BASE_URL`，值必须是手机可访问的绝对 HTTPS URL。
- 推荐取值：
  - 固定正式域名，如 `https://codex.example.com`
  - tunnel 临时域名，如 `https://abc123.ngrok-free.app`
- 启动时校验：
  - 必须为绝对 URL
  - 协议必须是 `https:`
  - 末尾斜杠统一归一化，避免拼接回调路径时出现双斜杠

### 双模能力
- 当 `PUBLIC_BASE_URL` 可用时：
  - 前端可启用“手机端独立授权”能力
- 当 `PUBLIC_BASE_URL` 不可用时：
  - 继续沿用当前的宿主机浏览器代开方案

## 信息架构

### 服务端新增接口
- `POST /api/auth/chatgpt/mobile/start`
  - 创建一次移动端 OAuth 会话
  - 返回 `loginSessionId`、`authUrl`、`expiresAt`
- `GET /api/auth/chatgpt/mobile/status?id=<loginSessionId>`
  - 查询会话状态
  - 返回 `pending | success | failed | expired | server_restarted | public_url_changed`
- `GET /auth/chatgpt/callback`
  - 处理 OAuth 回调
  - 校验 `state`
  - 将回调结果落到当前实例的账号状态

### 前端能力探测
- 账号中心读取配置时同时得知当前是否支持 `mobileDirectAuthAvailable`。
- ChatGPT 登录按钮保持单入口，根据能力自动选择：
  - 手机端直登
  - 宿主机代开

## 登录数据流

### 1. 发起登录
1. 手机端点击 `ChatGPT 登录`。
2. 前端调用 `POST /api/auth/chatgpt/mobile/start`。
3. `codex-web-local` 创建一次短期登录会话，并基于当前 `PUBLIC_BASE_URL` 生成回调地址。
4. 前端拿到 `authUrl` 后直接在当前手机浏览器中打开。

### 2. 等待完成
1. 前端进入 `waiting_completion`。
2. 前端轮询 `GET /api/auth/chatgpt/mobile/status?id=...`。
3. 页面展示等待、重试、过期或失败文案。

### 3. 回调落账
1. OAuth 提供方回调到 `${PUBLIC_BASE_URL}/auth/chatgpt/callback`。
2. 服务端根据 `state` 找到对应的登录会话。
3. 校验通过后，将 OAuth 结果转换为当前本地实例的已登录状态。
4. 更新登录会话状态为 `success` 或 `failed`。

### 4. 前端收口
1. 状态查询返回 `success` 后，前端刷新：
  - `account/read`
  - `account/rateLimits/read`
2. 账号中心回到首页，显示最新账号状态。

## 会话模型

### 最小字段
- `loginSessionId`
- `state`
- `createdAt`
- `expiresAt`
- `status`
- `error`
- `publicBaseUrlSnapshot`
- `appServerLoginId`

### 存储策略
- 首版存储在服务进程内存 `Map` 中。
- 配合 TTL 定时清理过期会话。
- 服务重启后会话全部失效，前端需提示重新发起登录。

## 安全边界

### 状态校验
- 回调必须匹配已存在且未过期的 `state`。
- 每个会话只允许第一次成功落账，重复回调走幂等返回。

### 地址快照
- 会话创建时记录 `publicBaseUrlSnapshot`。
- 当 tunnel 地址变化或服务配置更新后，旧会话直接判为 `public_url_changed`，避免旧地址回调串到新实例。

### 最小暴露原则
- 仅暴露移动端登录所需的最小 HTTP 接口，不扩展通用 RPC 契约。
- 移动端登录中间态不写入长期磁盘存储。

## 失败与异常处理
- 用户取消授权：会话标记为 `failed`，返回可重试文案。
- 回调缺少 `code` 或 `state`：直接判失败。
- 服务重启：前端状态接口返回 `server_restarted` 或等价失效态。
- `PUBLIC_BASE_URL` 变更：旧会话标记为 `public_url_changed`。
- OAuth 成功但本地账号刷新失败：会话标记为 `failed` 并附带错误信息。
- 接口不可用或 `PUBLIC_BASE_URL` 非 HTTPS：前端自动回退到宿主机浏览器授权模式。

## 前端交互
- ChatGPT 登录保持单按钮，不暴露实现差异。
- 当支持手机端直登时：
  - 直接在手机浏览器打开授权页
  - 等待页提示“请在当前手机浏览器完成授权”
- 当不支持时：
  - 使用现有宿主机浏览器代开
  - 等待页提示“将在运行服务的电脑浏览器中完成授权”
- 等待页统一展示：
  - `opening`
  - `pending`
  - `success`
  - `failed`
  - `expired`

## 模块落点
- `src/server/`
  - 新增 `PUBLIC_BASE_URL` 配置读取、移动端登录会话管理、回调路由和状态接口
- `src/api/codexGateway.ts`
  - 新增移动端直登相关 HTTP 封装
- `src/composables/useAccountCenterState.ts`
  - 统一编排手机端直登与宿主机代开两套登录流
- `src/components/account/`
  - 调整等待态文案与能力分流 UI
- `src/i18n/uiText.ts`
  - 补充直登可用性、过期和 tunnel 风险提示
- `README.md`、`README.zh-CN.md`、`docs/runtime/README.md`
  - 补充 `PUBLIC_BASE_URL`、固定域名和 tunnel 的配置说明

## 验证
- 设计评审需确认：
  - 手机端独立授权与宿主机代开是自动分流，而不是两套互相冲突的入口
  - 固定域名与 tunnel 都由同一个 `PUBLIC_BASE_URL` 模型承载
  - 服务重启、地址变化和重复回调都有明确失败态
- 实施后至少执行：
  - `node --test` 覆盖移动端登录会话与回调路由
  - `npm run build`
