# Web Local 语音私有 RPC 设计

## 背景

当前语音 fallback 已在 `codex-web-local` 中实现为两条本地 HTTP 接口：

- `GET /api/voice-input-capability`
- `POST /api/transcriptions`

这条路径已经可用，但它与当前仓库主流的 `codex-api` bridge 调用风格不一致。与此同时，如果直接把语音转写能力推进到正式 `app-server` 协议，又会触发 schema、文档、类型生成与上游兼容维护成本。

因此需要一个中间方案：让语音 fallback 看起来更像 `codex api server` 能力，但仍保持为 `codex-web-local` 私有扩展，不进入 upstream-compatible schema。

## 目标

- 把语音 fallback 的调用方式从裸 HTTP 路由收口为 bridge 私有 RPC
- 保持 `codex api server` 正式协议、schema 产物与 `src/api/appServerDtos.ts` 不变
- 让前端调用风格与现有 `/codex-api/rpc` 一致
- 保持现有产品语义不变：
  - `gpt-4o-mini-transcribe`
  - 仅无原生识别时 fallback 可用
  - 只回填 composer，不改线程消息协议

## 非目标

- 不向 `documentation/app-server-schemas/` 新增正式 schema
- 不修改 `src/api/appServerDtos.ts`
- 不做实时流式语音
- 不做多 provider 抽象
- 不把浏览器录音逻辑下沉到 app-server

## 方案对比

### 方案 A：保持当前本地 HTTP 接口

优点：

- 已经工作
- 改动最小

缺点：

- 与现有 `codex-api` 调用风格不一致
- Web 私有增强能力分散在独立 HTTP 路由中

结论：可继续使用，但不作为推荐演进方向。

### 方案 B：bridge 层私有 RPC

做法：

- 继续走 `POST /codex-api/rpc`
- 在 `codexAppServerBridge.ts` 中拦截一组 `web-local/*` 私有方法
- 命中后本地处理；未命中再透传给真实 app-server

优点：

- 前端调用风格统一
- 不引入正式协议维护成本
- 可以保留 `codex api server` 与 `codex-web-local` 的边界

缺点：

- 需要在 bridge 中维护一套私有方法名空间
- 短音频通过 JSON base64 传输，会比裸二进制请求更重

结论：采用。

### 方案 C：正式扩展 app-server 协议

优点：

- 语义上最“平台化”

缺点：

- 需要同步 schema、类型、契约文档和兼容策略
- 当前语音需求仍是 Web 私有输入增强，不足以支撑正式协议演进

结论：当前阶段不采用。

## 推荐设计

### 1. 私有方法命名空间

私有方法统一使用 `web-local/voice-input/*`，明确它属于 `codex-web-local` bridge 扩展，而不是 upstream app-server 标准方法。

首版只定义两个方法：

- `web-local/voice-input/capability/read`
- `web-local/voice-input/transcription/create`

### 2. 方法定义

#### `web-local/voice-input/capability/read`

用途：

- 返回服务端是否启用了 OpenAI fallback
- 返回前端需要的最小约束信息

请求：

```json
{
  "method": "web-local/voice-input/capability/read",
  "params": {}
}
```

返回：

```json
{
  "fallbackEnabled": true,
  "provider": "openai",
  "model": "gpt-4o-mini-transcribe",
  "maxAudioBytes": 2000000,
  "acceptedMimeTypes": [
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg",
    "audio/ogg;codecs=opus",
    "audio/mpeg",
    "audio/wav"
  ]
}
```

说明：

- 只描述服务端 fallback 能力
- 浏览器原生 `SpeechRecognition` 是否可用，仍由前端本地探测
- 前端最终仍合并成 `native | openai-fallback | unsupported`

#### `web-local/voice-input/transcription/create`

用途：

- 接收浏览器录音并返回转写文本

请求：

```json
{
  "method": "web-local/voice-input/transcription/create",
  "params": {
    "audioBase64": "<base64-audio>",
    "contentType": "audio/webm;codecs=opus",
    "language": "zh",
    "source": "composer-fallback"
  }
}
```

字段规则：

- `audioBase64`：必填，短音频内容
- `contentType`：必填，浏览器录音 MIME
- `language`：可选，建议 `zh` 或 `en`
- `source`：可选，首版固定 `composer-fallback`

返回：

```json
{
  "text": "你好，这是一段转写结果。",
  "provider": "openai",
  "model": "gpt-4o-mini-transcribe"
}
```

### 3. 错误码

沿用现有 bridge 的 `{ code, message }` 错误结构，不新增 `error.data`。

建议错误码：

- `-32602`：`Invalid params`
- `-32010`：`Voice input fallback is disabled`
- `-32011`：`Unsupported audio content type`
- `-32012`：`Audio payload too large`
- `-32013`：`Audio payload is empty`
- `-32014`：`Transcription upstream request failed`
- `-32015`：`Transcription upstream rate limited`
- `-32016`：`Transcription upstream returned no text`

### 4. 服务端分发

不在 `/codex-api/rpc` 的 HTTP handler 中内联私有方法逻辑，而是在 `CodexAppServerBridge.rpc()` 中先做本地私有分发：

1. 命中 `web-local/voice-input/*`
2. 本地处理并返回结果
3. 未命中则继续透传真实 app-server

这样可以保证：

- 私有 RPC 与普通 RPC 共用同一个入口
- 测试与未来扩展更集中

### 5. 数据流

前端：

1. 本地探测浏览器原生语音能力
2. 调 `web-local/voice-input/capability/read`
3. 合并为最终 `VoiceInputMode`
4. 若进入 fallback，录音后调用 `web-local/voice-input/transcription/create`
5. 将返回文本回填到 composer

服务端：

1. bridge 收到私有 RPC
2. 校验参数
3. 调用现有 OpenAI 转写服务
4. 返回 `{ text, provider, model }`

### 6. 落点文件

- `src/server/codexAppServerBridge.ts`
  - 新增私有 RPC 分发
- `src/server/transcriptionService.ts`
  - 复用现有 OpenAI 调用逻辑
- `src/api/voiceInputRpc.ts`
  - 新增前端 RPC 调用封装
- `src/components/content/ThreadComposer.vue`
  - 从 HTTP gateway 切换为私有 RPC
- `src/utils/voiceInput.ts`
  - 保持三态能力合并逻辑
- `docs/contracts/`
  - 增加私有 RPC 说明文档，明确它不是 app-server 正式 schema

### 7. 风险

- base64 传输会放大音频体积，因此只适合短录音 fallback
- 若未来还有更多 Web 私有扩展，bridge 私有命名空间需要统一治理
- 若未来真要 upstream 化，需要再从私有 RPC 迁移到正式 schema

## 为什么值得做

这条方案的价值不在“新增功能”，而在于把现有功能从零散 HTTP 旁路收口为 bridge 私有扩展：

- 对前端更统一
- 对协议边界更清晰
- 对上游 schema 维护更克制

## 验收标准

- 前端不再直接调用 `/api/voice-input-capability` 与 `/api/transcriptions`
- 语音 fallback 全部改走 `/codex-api/rpc`
- `documentation/app-server-schemas/` 无新增或改动
- `src/api/appServerDtos.ts` 保持不变
- 现有 fallback 行为不变：仍只在无原生识别时可用，仍只回填 composer
