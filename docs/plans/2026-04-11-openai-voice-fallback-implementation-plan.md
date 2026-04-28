# OpenAI Voice Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为不支持原生 `SpeechRecognition` 的浏览器增加 `gpt-4o-mini-transcribe` 语音转文字 fallback，并保持 `codex api server` 协议与线程消息结构不变。

**Architecture:** 语音输入继续作为 `codex-web-local` 的输入增强层。前端先合并浏览器原生能力和服务端 `fallbackEnabled` 标记，得到 `native | openai-fallback | unsupported` 三态；仅在 `openai-fallback` 时录音并调用本地 Express 的 `/api/transcriptions`，由服务端代理 OpenAI 转写并把文本返回给 composer。

**Tech Stack:** Vue 3、TypeScript、Express、Node `http/https`、浏览器 `MediaRecorder`、OpenAI Audio Transcriptions API、Node `node:test`、Vite、tsup

---

## 背景与范围

- 现状：
  - `src/utils/voiceInput.ts` 只识别 `native | unsupported`
  - `src/components/content/ThreadComposer.vue` 只有原生语音识别链路
  - `src/server/httpServer.ts` 当前没有转写或语音能力接口
  - `tests/transcriptionService.test.mjs` 当前断言服务端不暴露转写能力
- 本次范围：
  - 新增服务端语音能力探测与 OpenAI 转写代理
  - 为 composer 增加仅 fallback 可用的录音路径
  - 更新测试和运行文档
- 非目标：
  - 不改 `/codex-api/*` 桥接逻辑
  - 不增加实时语音或自动发送
  - 不增加切换开关或多 provider 抽象

## 风险与回滚

- 风险：
  - `MediaRecorder` 可用但默认 MIME 与服务端校验不一致时，会导致 fallback 失败
  - 服务端若只配置了 `OPENAI_API_KEY` 而未显式启用开关，用户可能误以为语音应当可用
  - OpenAI 调用失败时需要确保前端回到可重试状态
- 回滚方式：
  - 删除 `/api/voice-input-capability` 与 `/api/transcriptions`
  - 移除 `openai-fallback` 模式与前端录音逻辑
  - 恢复文档为“仅原生识别”

## 分步执行清单

### Task 1: 先把测试预期翻到新设计

**Files:**
- Modify: `tests/voiceInputUi.test.mjs`
- Modify: `tests/transcriptionService.test.mjs`
- Modify: `tests/cliVoiceInputConfig.test.mjs`

**Step 1: 更新语音 UI 源码约束测试**

- 让 `voiceInputUi.test.mjs` 断言 `src/utils/voiceInput.ts` 出现 `openai-fallback` 三态。
- 断言 `ThreadComposer.vue` 新增 `recording-fallback`、`transcribing-fallback`、能力探测请求和 fallback 转写入口。
- 继续断言转写结果只回填草稿，不会直接发送。

**Step 2: 更新服务端配置与路由测试**

- 让 `transcriptionService.test.mjs` 改为断言 `src/server/httpServer.ts` 暴露 `/api/voice-input-capability` 与 `/api/transcriptions`。
- 断言新增服务端转写实现文件会调用 `gpt-4o-mini-transcribe`，而不是本地 `whisper.cpp`。
- `cliVoiceInputConfig.test.mjs` 改为验证环境变量归一化后的 fallback 配置，而不是仅验证 HTTPS。

**Step 3: 运行测试并确认当前实现失败**

Run: `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/cliVoiceInputConfig.test.mjs`

Expected: FAIL，且失败点来自源码尚未包含 OpenAI fallback 结构。

### Task 2: 增加运行时 fallback 配置

**Files:**
- Modify: `src/cli/runtimeConfig.ts`
- Modify: `src/cli/index.ts`

**Step 1: 扩展运行时配置类型**

- 在 `NormalizedCliRuntimeConfig` 中加入 `voiceInputFallback` 配置块。
- 从 `process.env` 读取 `OPENAI_API_KEY` 与 `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED`。
- 只在两个条件都满足时返回 `enabled: true`。

**Step 2: 把配置传入服务端创建函数**

- 让 `createApp` 接收 `voiceInputFallback`。
- 保持现有 CLI 参数不变，不新增 `--stt-*` 或新的命令行选项。

### Task 3: 新增服务端能力探测与转写代理

**Files:**
- Add: `src/server/transcriptionService.ts`
- Modify: `src/server/httpServer.ts`

**Step 1: 编写最小转写服务**

- 创建 `transcriptionService.ts`，封装：
  - `isVoiceInputFallbackEnabled`
  - `transcribeAudioWithOpenAi`
- 请求 OpenAI `audio/transcriptions`，模型固定 `gpt-4o-mini-transcribe`。
- 对空音频、缺少 API key、上游失败做统一错误映射。

**Step 2: 在 Express 中接线两个本地接口**

- `GET /api/voice-input-capability` 返回 `{ fallbackEnabled }`
- `POST /api/transcriptions` 接收音频二进制流并返回 `{ text }`
- 路由必须位于静态资源和 SPA fallback 之前，并继续受现有密码保护中间件覆盖。

**Step 3: 加入最小请求校验**

- 校验请求体不为空
- 校验 `Content-Type` 属于允许的音频类型
- 可选接收语言参数，但模型固定不变

### Task 4: 新增前端转写网关与能力合并

**Files:**
- Add: `src/api/transcriptionGateway.ts`
- Modify: `src/utils/voiceInput.ts`

**Step 1: 实现浏览器到本地服务端的调用**

- 在 `transcriptionGateway.ts` 中实现：
  - `fetchVoiceInputCapability()`
  - `requestOpenAiTranscription(blob, language)`
- 对非 2xx 响应抛出统一错误。

**Step 2: 扩展语音能力探测模型**

- `VoiceInputMode` 从 `native | unsupported` 改为：
  - `native`
  - `openai-fallback`
  - `unsupported`
- 暴露一个合并函数，让浏览器原生能力与服务端 `fallbackEnabled` 一起决定最终模式。

### Task 5: 在 composer 中接入 fallback 录音路径

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 扩展状态机与文案**

- 为 `ThreadComposer` 增加：
  - `recording-fallback`
  - `transcribing-fallback`
- 在 `uiText.ts` 增加录音中、转写中、fallback 不可用时所需的最小文案。

**Step 2: 增加初始化能力探测**

- 组件挂载后请求 `fetchVoiceInputCapability()`
- 与本地原生能力合并为最终 `voiceInputSupport`
- 保持“支持原生识别的浏览器继续只走原生逻辑”

**Step 3: 增加 fallback 录音与转写动作**

- 使用 `getUserMedia + MediaRecorder`
- 停止录音后调用 `requestOpenAiTranscription`
- 成功时复用 `applyTranscriptToDraft`
- 失败时进入 `failed` 状态，但不丢弃已有草稿

### Task 6: 同步文档与计划结果

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/plans/2026-04-11-openai-voice-fallback-design.md`
- Modify: `docs/plans/2026-04-11-openai-voice-fallback-implementation-plan.md`

**Step 1: 更新运行说明**

- 说明原生识别仍是主通道
- 说明 OpenAI 仅作为无原生识别时的 fallback
- 记录启用所需环境变量
- 继续保留 HTTPS / iPhone 访问建议

**Step 2: 回填计划执行结果**

- 在计划文档中补实际修改文件、验证命令、偏差和后续待办。

## 验收与验证

- 运行：`node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/cliVoiceInputConfig.test.mjs`
- 运行：`npm run build`
- 搜索：`rg -n "gpt-4o-mini-transcribe|voice-input-capability|/api/transcriptions|openai-fallback" src tests README.md README.zh-CN.md docs/runtime/README.md`
- 确认支持原生识别的浏览器路径未被 OpenAI fallback 覆盖

## Notes

- 本计划默认不包含 `git add` / `git commit`
- 若实现过程中发现需要新增第三方 multipart 依赖，应先复核是否仍属于“最小改动”
- 如需扩大为“全平台统一走服务端 STT”或“支持手动切换”，应另写计划

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/cli/runtimeConfig.ts`
- `src/cli/index.ts`
- `src/server/httpServer.ts`
- `src/server/transcriptionService.ts`
- `src/api/transcriptionGateway.ts`
- `src/utils/voiceInput.ts`
- `src/components/content/ThreadComposer.vue`
- `src/i18n/uiText.ts`
- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`
- `docs/plans/2026-04-11-openai-voice-fallback-implementation-plan.md`

**验证记录:**
- `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/cliVoiceInputConfig.test.mjs`：PASS
- `npm run build`：PASS

**实际结果摘要:**
- 新增 `/api/voice-input-capability` 与 `/api/transcriptions`
- 运行时通过 `OPENAI_API_KEY` 与 `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1` 控制 fallback 开启
- 浏览器原生识别仍为主通道；仅在无原生识别且服务端启用时走 `gpt-4o-mini-transcribe` fallback
- 转写结果仍只回填 composer，不改线程消息协议

**与计划偏差:**
- 为保持最小依赖面，服务端转写请求继续使用原生 `fetch + FormData`，没有新增 OpenAI SDK 或 multipart 解析依赖
- 前端能力合并时额外检查了浏览器 `MediaRecorder` / `getUserMedia` 支持，避免服务端启用后在不支持录音的浏览器里误展示按钮

**后续待办:**
- 可补更细的 OpenAI 配额 / 网络失败提示
- 可视需要补充端到端录音交互验证
