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
