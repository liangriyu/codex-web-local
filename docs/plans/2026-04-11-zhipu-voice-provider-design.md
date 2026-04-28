# 智谱语音 Provider 设计

## 背景

当前 `codex-web-local` 的语音 fallback 已固定接到 OpenAI `gpt-4o-mini-transcribe`。前端通过私有 RPC：

- `web-local/voice-input/capability/read`
- `web-local/voice-input/transcription/create`

读取能力并提交短录音，服务端在本地 bridge 层转发到 OpenAI。现阶段需要增加智谱 ASR 接入能力，以降低对 OpenAI API 计费与支付方式的依赖，同时保持现有前端交互、线程协议和私有 RPC 契约不变。

## 目标

- 增加 `zhipu` 作为语音 fallback 的第二个 provider。
- 保持现有私有 RPC 方法名、前端按钮行为和 composer 状态流不变。
- 通过环境变量选择当前 provider，而不是修改前端或 app-server 正式 schema。
- 继续支持 OpenAI，避免一次性替换现有实现。

## 非目标

- 不引入自动 provider 回退链路。
- 不改正式 `documentation/app-server-schemas/` 契约。
- 不新增音频消息类型。
- 不做实时流式转写，只处理短录音转文本。

## 方案对比

### 方案 A：双 provider，环境变量选择

- 服务端保留统一语音转写接口，根据配置选择 `openai` 或 `zhipu`。
- 前端和私有 RPC 保持不变。
- 优点：风险最低，现有 OpenAI 实现可保留，后续也容易再扩 provider。
- 缺点：服务端配置与错误映射会增加一层抽象。

### 方案 B：直接切到智谱

- 删除或停用 OpenAI，只保留智谱。
- 优点：实现简单一些。
- 缺点：破坏现有 OpenAI 能力，回退空间变小。

### 方案 C：智谱优先，OpenAI 兜底

- 服务端串联两家上游，失败后自动尝试第二家。
- 优点：可用性更高。
- 缺点：错误语义、计费边界和调试成本明显上升。

## 推荐方案

采用 **方案 A：双 provider，环境变量选择**。

它最符合当前仓库边界：

- 不动前端交互
- 不动 bridge 私有 RPC 方法名
- 不动 app-server 正式 schema
- 只在 `runtimeConfig + transcriptionService + bridge 错误映射` 这条服务端链路增加 provider 抽象

## 架构设计

### 1. 前端与私有 RPC

前端继续使用：

- `web-local/voice-input/capability/read`
- `web-local/voice-input/transcription/create`

`ThreadComposer.vue`、`voiceInputRpc.ts` 不感知 provider 细节，只消费能力结果中的：

- `provider`
- `model`
- `fallbackEnabled`

前端交互保持现状：

- 原生浏览器识别优先
- 不支持原生识别时才展示 fallback 入口
- 转写结果只回填输入框，不自动发送

### 2. 服务端 Provider 抽象

当前 [transcriptionService.ts](../../src/server/transcriptionService.ts) 仅支持 OpenAI。调整为统一的 provider 化配置：

- `provider: 'openai' | 'zhipu'`
- `apiKey?: string`
- `model: string`
- `enabled: boolean`

统一导出：

- `getCapability()`
- `isVoiceInputFallbackEnabled()`
- `transcribeAudio()`

内部根据 `provider` 分发到：

- `transcribeAudioWithOpenAi()`
- `transcribeAudioWithZhipu()`

### 3. 运行时配置

在 [runtimeConfig.ts](../../src/cli/runtimeConfig.ts) 中增加基于环境变量的 provider 归一化。推荐环境变量：

- `CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER=openai|zhipu`
- `OPENAI_API_KEY`
- `ZHIPU_API_KEY`
- `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1`
- `CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED=1`

默认规则：

- 未显式指定 provider 时，默认 `openai`
- `openai` 仍使用 `gpt-4o-mini-transcribe`
- `zhipu` 默认模型使用 `glm-asr-2512`
- 只有当前 provider 对应的 `enabled flag + apiKey` 同时满足时，`fallbackEnabled` 才为 `true`

### 4. 智谱上游调用

按智谱官方 ASR 接口，服务端使用 `multipart/form-data` 上传音频文件，并通过 `Authorization` 传递 API key。首版保持与 OpenAI 一致的限制：

- OpenAI 继续接受现有浏览器录音常见 MIME
- 智谱按官方格式限制只接受 `audio/wav` / `audio/mpeg` / `audio/mp3`
- 最大音频体积不变（`2_000_000` bytes）
- 继续只处理短录音 fallback

由于浏览器 `MediaRecorder` 常见输出是 `webm/mp4/ogg`，实际落地时前端需要在命中智谱 provider 且 MIME 不兼容时，将录音 blob 转换为 `audio/wav` 后再上传。这一转换只发生在 fallback 路径，不影响原生语音识别链路。

服务端统一从智谱响应中抽取文本，返回给前端标准结果：

- `text`
- `provider`
- `model`

## 错误处理

前端仍只消费统一错误语义，不绑定到具体 provider。

服务端映射为统一错误：

- fallback 未启用
- 音频为空
- 音频过大
- MIME 不支持
- 上游请求失败
- 上游限流
- 上游额度不足
- 上游无文本

其中：

- OpenAI 的 `insufficient_quota`
- 智谱的余额/额度类错误

都统一映射到“额度不足”语义，前端继续显示统一提示。

## 文档与配置说明

需要同步更新：

- [README.md](../../README.md)
- [README.zh-CN.md](../../README.zh-CN.md)
- [docs/runtime/README.md](../runtime/README.md)
- [docs/contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md](../contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md)

文档重点说明：

- 现支持 `openai` / `zhipu` 两个 provider
- 如何通过环境变量选择 provider
- 各 provider 需要的 API key
- iPhone / 局域网浏览器仍建议通过 HTTPS 访问

## 验证策略

至少覆盖以下验证：

- `tests/transcriptionService.test.mjs`
- `tests/cliVoiceInputConfig.test.mjs`
- `tests/voiceInputPrivateRpc.test.mjs`
- `npm run build`

重点断言：

- `openai` 与 `zhipu` 配置都能正确归一化
- `capability/read` 会返回对应 provider 与 model
- `transcription/create` 会根据 provider 调用正确的上游逻辑
- 额度不足与上游失败会被统一映射到预期错误

## 风险

- 智谱 ASR 的错误码与返回体可能与 OpenAI 差异较大，需要做一次稳定映射。
- 若只用环境变量切换 provider，文档必须清楚，否则容易配错 key 与开关。
- 不做自动 provider 回退意味着一旦当前 provider 配错，fallback 会直接不可用。

## 结论

本次增加智谱语音接入能力，推荐以 **“保留现有私有 RPC 与前端交互不变，仅在服务端增加 provider 抽象与配置选择”** 的方式落地。这样改动面最小，兼容当前 OpenAI 实现，也为后续继续扩展 provider 留下稳定边界。
