# Web Local 私有 RPC

## 说明

本文记录 `codex-web-local` 在 bridge 层自定义的私有 RPC 方法。

这些方法：

- 通过现有 `POST /codex-api/rpc` 通道调用
- 由 `src/server/codexAppServerBridge.ts` 本地拦截并处理
- 不属于 upstream `app-server` 正式 schema
- 不会写入 `documentation/app-server-schemas/`

## 当前方法

### `web-local/voice-input/capability/read`

用途：

- 返回服务端是否启用了语音 fallback
- 返回前端录音 fallback 需要的最小约束信息

返回字段：

- `fallbackEnabled: boolean`
- `provider: "openai" | "zhipu"`
- `model: string`
- `maxAudioBytes: number`
- `acceptedMimeTypes: string[]`

### `web-local/voice-input/transcription/create`

用途：

- 提交短录音并返回转写文本

请求字段：

- `audioBase64: string`
- `contentType: string`
- `language?: string | null`
- `source?: string | null`

返回字段：

- `text: string`
- `provider: "openai" | "zhipu"`
- `model: string`

### `web-local/account/profiles/list`

用途：

- 读取账号档案池（脱敏视图）
- 返回当前活跃账号档案 ID

返回字段：

- `activeProfileId: string | null`
- `profiles: Array<{ profileId, accountId, provider, email, planType, status, lastUsedAtIso, tokenState, chatgptAccountId, chatgptPlanType, tokenExpiresAtIso }>`

说明：

- 返回结果不包含 `accessToken` 明文

### `web-local/account/active/read`

用途：

- 读取当前活跃账号档案

返回字段：

- `activeProfileId: string | null`
- `activeProfile: object | null`（字段结构同 `profiles/list` 中单条记录）

### `web-local/account/profiles/add`

用途：

- 新增或覆盖一个账号档案（按 `profileId`）

请求字段：

- `profileId?: string`（缺省时回退到 `accountId`）
- `accountId?: string`
- `email?: string | null`
- `planType?: string | null`
- `accessToken: string`
- `chatgptAccountId?: string`（缺省时回退到 `accountId`）
- `chatgptPlanType?: string | null`
- `expiresAtIso?: string | null`
- `status?: "active" | "inactive" | "expired" | "revoked"`
- `setActive?: boolean`

返回字段：

- 与 `web-local/account/profiles/list` 相同

### `web-local/account/profiles/switch`

用途：

- 将目标档案切换为当前活跃账号（通过 `account/login/start` + `chatgptAuthTokens`）

请求字段：

- `profileId: string`

返回字段：

- `activeProfileId: string | null`
- `profiles: [...]`
- `switched: { activeProfileId: string, previousProfileId: string | null }`

### `web-local/account/profiles/remove`

用途：

- 删除账号档案；若删除的是当前活跃档案，则同时清空活跃档案指针

请求字段：

- `profileId: string`

返回字段：

- 与 `web-local/account/profiles/list` 相同

## 非私有 RPC 但已接入的账号自动应答

- bridge 已在 server-request 流程中接入 `account/chatgptAuthTokens/refresh` 自动应答：
  - 会按 `previousAccountId` 在档案池中匹配账号
  - 命中后自动回填 `{ accessToken, chatgptAccountId, chatgptPlanType }`
  - 未命中或出错时回退到原有 pending request 人工处理路径

## 错误码

当前私有 RPC 约定以下错误码：

- `-32602`：参数非法
- `-32010`：语音 fallback 未启用
- `-32011`：音频 MIME 不支持
- `-32012`：音频体积过大
- `-32013`：音频为空
- `-32014`：上游转写请求失败
- `-32015`：上游限流
- `-32016`：上游返回无文本
- `-32017`：上游额度不足

## 维护边界

如果某个私有 RPC 需要被多个客户端共享，或需要与 upstream `app-server` 对齐，应另行设计正式协议并同步：

- `documentation/app-server-schemas/`
- `src/api/appServerDtos.ts`
- `docs/contracts/README.md`
