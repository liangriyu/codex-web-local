# 语音输入转文本能力设计

## 背景

当前 Web 输入器只支持文本草稿和图片输入，线程提交链路只接受 `text + images`。因此语音能力的最佳接入方式不是引入音频消息类型，而是把识别结果先写回输入框，再沿用现有消息提交协议。

用户目标明确为：

- 主目标平台是 `Chrome / Edge 桌面` 与 `Android Chrome`
- 同时尽可能兼容 `iPhone Chrome`
- 方案必须免费

## 目标

- 为输入器增加语音输入转文本能力
- `Chrome / Edge 桌面` 与 `Android Chrome` 优先提供低延迟体验
- `iPhone Chrome` 在原生识别不可依赖时仍具备可用回退路径
- 不改现有线程消息协议
- 默认不自动发送，转写结果先写回输入框，由用户确认后提交

## 非目标

- 不做音频消息历史
- 不做自动发送
- 不做实时双向流式转写
- 不依赖第三方付费 STT API

## 方案对比

### 方案 A：纯浏览器原生语音识别

优点：

- 前端改动最小
- 桌面 Chrome / Android Chrome 体验最好

缺点：

- 无法把 `iPhone Chrome` 作为稳定兼容目标
- 缺少统一回退路径

### 方案 B：推荐方案，Hybrid 双通道

- 主通道：浏览器原生 `SpeechRecognition`
- 回退通道：浏览器录音 + 本机离线 STT

优点：

- 桌面 Chrome / Android Chrome 保留原生低延迟
- `iPhone Chrome` 有明确 fallback
- 满足免费约束
- 不需要改现有线程协议

缺点：

- 需要维护两条能力路径
- `iPhone Chrome` 的 fallback 依赖 HTTPS 和本机 STT 配置

### 方案 C：全平台统一录音 + 本机离线 STT

优点：

- 平台行为最一致

缺点：

- 对 Chrome 系桌面与 Android 来说体验更重
- 服务端和 HTTPS 成为所有平台的强依赖

结论：采用方案 B。

## 推荐设计

### 1. 总体架构

采用 `Hybrid 双通道`：

- `Chrome / Edge 桌面` 与 `Android Chrome`：优先原生识别
- `iPhone Chrome`：优先 fallback 录音 + 本机离线 STT

两条路径都只负责把文本回填到 composer 草稿。

### 2. 前端交互

在 `ThreadComposer` 中增加语音按钮，状态机最小化为：

- `idle`
- `listening-native`
- `recording-fallback`
- `transcribing-fallback`
- `failed`

### 3. Fallback 路径

- 浏览器用 `getUserMedia + MediaRecorder`
- 录音结束后调用 `POST /api/transcriptions`
- 本机服务调用本地离线 STT 并返回文本

### 4. 本机离线 STT

首版推荐 `whisper.cpp` 风格的本地可执行程序，通过 CLI 参数配置：

- `--stt-command`
- `--stt-model`
- `--stt-language`
- `--stt-timeout-ms`

### 5. HTTPS 前提

`iPhone Chrome` 想使用录音回退，必须通过 HTTPS 访问。单纯 `http://局域网IP` 不足以可靠启用麦克风。

## 实现落点

- `src/components/content/ThreadComposer.vue`
- `src/utils/voiceInput.ts`
- `src/api/transcriptionGateway.ts`
- `src/server/transcriptionService.ts`
- `src/server/httpServer.ts`
- `src/cli/runtimeConfig.ts`
- `src/cli/index.ts`
- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`

## 验收标准

- `Chrome / Edge 桌面` 与 `Android Chrome` 可通过原生识别将文本写回输入框
- `iPhone Chrome` 在启用 HTTPS 与本机 STT 时可通过 fallback 录音将文本写回输入框
- 线程消息协议保持不变
- 识别失败时不丢失已有草稿
