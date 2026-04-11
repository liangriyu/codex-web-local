# OpenAI 语音回退设计

## 背景

当前输入器只保留浏览器原生 `SpeechRecognition` 入口；当浏览器不支持原生识别时，语音按钮不会展示。[README.zh-CN.md](../../README.zh-CN.md) 已明确说明当前版本移除了本地离线 STT 回退链路，`iPhone` 浏览器若要继续支持录音转写，需要后续接入第三方 STT 服务。

本次需求已经收敛为：

- 服务基于 `codex api server` 提供对标 `codex app` 的核心能力
- 语音输入继续作为 `codex-web-local` 的输入增强层，不进入 app-server 协议
- 模型固定为 `gpt-4o-mini-transcribe`
- 仅在浏览器不支持原生识别时启用 fallback
- 语音结果只回填 composer 草稿，不自动发送

## 目标

- 为无原生 `SpeechRecognition` 的浏览器提供可用的 OpenAI 语音转文字 fallback
- 保持 `codex api server` 协议、线程消息结构与发送链路不变
- 避免在前端暴露 OpenAI API Key
- 让 fallback 能力显式受服务端配置控制

## 非目标

- 不改 app-server schema、事件或方法
- 不新增音频消息类型或语音历史
- 不做实时流式转写
- 不为支持原生识别的浏览器提供手动切换开关
- 不恢复本地离线 STT 或 `whisper.cpp` CLI 配置

## 方案对比

### 方案 A：前端直接请求 OpenAI

优点：

- 接线最短
- 服务端无需新增转写路由

缺点：

- 需要把 OpenAI 凭据暴露给浏览器，不符合当前产品形态
- 难以和现有登录态、密码保护、限流策略统一
- 无法稳定控制“仅 fallback 可用”

结论：不采用。

### 方案 B：`codex-web-local` 服务端代理转写请求

优点：

- OpenAI API Key 只保存在服务端
- 可以复用现有 Web 登录态保护本地接口
- 不污染 `codex api server` 协议边界
- 便于后续替换为其他第三方 STT 服务

缺点：

- 需要新增能力探测接口和转写路由
- 需要维护浏览器录音上传逻辑

结论：采用。

### 方案 C：把语音转写接进 app-server 协议

优点：

- 理论上可以统一成“平台能力”

缺点：

- 会让 app-server 协议承担浏览器录音、密钥管理、服务商适配等 UI 层职责
- 会扩大与上游 `codex app` 协议的一致性维护成本

结论：不采用。

## 推荐设计

### 1. 架构边界

- `codex api server`：继续只处理现有线程、消息、工具调用和协议桥接，不感知语音输入。
- `codex-web-local` Express 服务：新增语音能力探测与转写代理。
- `ThreadComposer`：仅在原生识别不可用且服务端显式开启 fallback 时，展示录音按钮并在录音结束后请求转写。

这保持了“核心协议层稳定，Web 适配层增强”的边界。

### 2. 配置方式

采用环境变量启用 fallback，不新增 app-server 契约：

- `OPENAI_API_KEY`：必填，用于服务端调用 OpenAI
- `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1`：显式开关，避免仅因环境里存在通用 OpenAI key 就意外暴露语音入口

模型不做用户可配，固定为 `gpt-4o-mini-transcribe`，减少配置和测试面。

### 3. 能力探测

前端当前只有 `native | unsupported` 两态，不足以区分“浏览器不支持原生识别，但服务端已提供 fallback”。

因此新增一个轻量本地接口：

- `GET /api/voice-input-capability`

返回最小 JSON：

```json
{
  "fallbackEnabled": true
}
```

前端在 composer 初始化时拉取该信息，并与浏览器原生能力合并为三态：

- `native`
- `openai-fallback`
- `unsupported`

### 4. Fallback 录音与转写

仅在 `openai-fallback` 模式下：

- 浏览器通过 `getUserMedia + MediaRecorder` 采集短音频
- 停止录音后将音频发送给 `POST /api/transcriptions`
- 服务端调用 OpenAI `audio/transcriptions`，模型固定为 `gpt-4o-mini-transcribe`
- 返回 `{ text }`
- 前端将文本通过既有 `mergeDraftWithTranscript` 逻辑追加回输入框

为了避免新增 multipart 依赖，首版请求体直接使用音频二进制流，配合请求头携带 `Content-Type` 与可选语言参数。

### 5. 状态与错误处理

保留现有原生状态，并补充最小 fallback 状态：

- `idle`
- `listening-native`
- `recording-fallback`
- `transcribing-fallback`
- `failed`

错误处理原则：

- 任一路径失败都不清空已有草稿
- Fallback 不可用时不展示录音按钮
- 服务端未配置或返回失败时，展示统一“语音转写失败，请重试”

### 6. 认证与安全

- `/api/voice-input-capability` 与 `/api/transcriptions` 都挂在现有 Express 应用内，默认受密码保护中间件覆盖
- OpenAI Key 不下发到浏览器
- 服务端对录音大小、MIME 类型和空请求做最小校验

### 7. 文档同步

本次需要同步：

- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`

文档应明确：

- 原生识别仍是主通道
- OpenAI 只作为无原生识别时的 fallback
- 需要服务端显式开启环境变量
- `iPhone` / 局域网场景仍建议使用 HTTPS 访问

## 风险

- 浏览器 `MediaRecorder` 的 MIME 支持差异可能导致部分环境需要回退到可用格式探测
- OpenAI 网络或配额异常会让 fallback 短暂不可用
- 若能力探测接口与真实服务端配置不同步，按钮展示可能与实际转写能力不一致

## 验收标准

- 支持原生 `SpeechRecognition` 的浏览器保持当前行为，不展示 OpenAI fallback 入口
- 不支持原生识别但服务端已启用 fallback 时，展示录音入口并可把转写文本写回输入框
- 不支持原生识别且服务端未启用 fallback 时，不展示语音入口
- 线程消息协议不变，仍只发送 `text + images`
- 相关运行文档与配置说明同步更新
