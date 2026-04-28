# Voice Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为输入器增加语音输入转文本能力，在 `Chrome / Edge 桌面` 与 `Android Chrome` 优先走原生识别，同时通过浏览器录音 + 本机离线 STT 尽可能兼容 `iPhone Chrome`。

**Architecture:** 语音功能只作为 composer 草稿增强，不改线程协议。前端根据平台与能力在原生识别和 fallback 录音之间切换；fallback 调用当前 Express 服务新增的 `/api/transcriptions`，由本机离线 STT 返回文本。CLI 同时补齐 HTTPS 与本机 STT 配置入口。

**Tech Stack:** Vue 3、TypeScript、Express、Node `http/https`、Node `child_process`、浏览器 `SpeechRecognition`、`MediaRecorder`、本机 `whisper.cpp` 风格可执行程序、Node `node:test`

---

### Task 1: 为语音输入 UI 增加失败测试

### Task 2: 接入前端能力探测与转写网关

### Task 3: 在 composer 中接入原生识别主通道

### Task 4: 在 composer 中接入 fallback 录音通道

### Task 5: 增加本机转写服务与 `/api/transcriptions`

### Task 6: 为 CLI 增加 HTTPS 与 STT 参数

### Task 7: 补运行文档与 iPhone 使用说明

### Task 8: 完成验证并回填执行结果

## Notes

- 首版不引入音频消息类型
- 首版不做自动发送
- `iPhone Chrome` 的回退路径依赖 HTTPS 与本机 STT
- 本计划默认不包含 `git add` / `git commit`

## Related Docs

- 设计文档：[2026-04-07-voice-input-design.md](./2026-04-07-voice-input-design.md)

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/components/content/ThreadComposer.vue`
- `src/utils/voiceInput.ts`
- `src/api/transcriptionGateway.ts`
- `src/server/transcriptionService.ts`
- `src/server/httpServer.ts`
- `src/cli/runtimeConfig.ts`
- `src/cli/index.ts`
- `src/i18n/uiText.ts`
- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`
- `docs/plans/2026-04-07-voice-input-design.md`
- `docs/plans/2026-04-07-voice-input-implementation-plan.md`
- `tests/voiceInputUi.test.mjs`
- `tests/transcriptionService.test.mjs`
- `tests/cliVoiceInputConfig.test.mjs`

**验证记录:**
- `node --test tests/voiceInputUi.test.mjs`：PASS
- `node --test tests/transcriptionService.test.mjs tests/cliVoiceInputConfig.test.mjs`：PASS
- `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/cliVoiceInputConfig.test.mjs`：PASS（9/9）
- `npm run build`：PASS

**实际结果摘要:**
- composer 已支持语音按钮、原生识别主通道和 fallback 录音通道
- 语音结果只回填输入框，不直接发送
- 新增 `/api/transcriptions`，由本机离线 STT 返回文本
- CLI 已支持 HTTPS 与本机 STT 配置
- README、README.zh-CN 与 runtime 文档已补充 iPhone Chrome、HTTPS 与本机 STT 说明

**与计划偏差:**
- 为了兼容当前仓库的 ESM 测试导入方式，HTTP 路由接线测试采用源码约束方式，而不是直接启动 `httpServer.ts` 做端到端测试
- 首版本地 STT 先按 `whisper.cpp` 风格参数接入，没有继续抽象多引擎适配层

**后续待办:**
- 可补浏览器端更细的错误提示 UI
- 可补 HTTPS 自签证书与 iPhone 安装证书的完整指南
- 可继续评估转写中的术语词表和更长录音体验
