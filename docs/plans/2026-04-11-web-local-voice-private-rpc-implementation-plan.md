# Web Local Voice Private RPC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有 OpenAI 语音 fallback 从本地 HTTP 接口迁移为 `codex-web-local` bridge 私有 RPC，同时保持正式 app-server schema 与线程消息协议不变。

**Architecture:** 在 `CodexAppServerBridge.rpc()` 中先拦截 `web-local/voice-input/*` 私有方法并本地处理；未命中再透传真实 app-server。前端新增 `voiceInputRpc.ts` 封装，通过现有 `/codex-api/rpc` 通道读取语音能力和提交短录音转写请求。

**Tech Stack:** Vue 3、TypeScript、Node `http`、Express bridge middleware、JSON-RPC 风格调用、OpenAI Audio Transcriptions API、Node `node:test`、Vite、tsup

---

## 背景与范围

- 现状：
  - 语音 fallback 已通过 `/api/voice-input-capability` 和 `/api/transcriptions` 实现
  - 前端通过 `src/api/transcriptionGateway.ts` 直接请求本地 HTTP
  - `documentation/app-server-schemas/` 未引入任何语音转写 schema
- 本次范围：
  - 把能力探测和转写提交改成 bridge 私有 RPC
  - 删除不再需要的裸 HTTP 路由和前端 HTTP gateway
  - 增加私有 RPC 文档说明
- 非目标：
  - 不修改 `documentation/app-server-schemas/`
  - 不修改 `src/api/appServerDtos.ts`
  - 不改变 OpenAI fallback 的产品行为

## 风险与回滚

- 风险：
  - base64 音频在 JSON-RPC 中更大，若录音太长会增加请求体开销
  - bridge 私有 RPC 若与透传逻辑耦合不清，可能影响现有 RPC 调用
- 回滚方式：
  - 恢复 `/api/voice-input-capability` 与 `/api/transcriptions`
  - 前端切回 `transcriptionGateway.ts`
  - 删除私有 RPC 分发

## 分步执行清单

### Task 1: 先把测试预期切到私有 RPC 方案

**Files:**
- Modify: `tests/voiceInputUi.test.mjs`
- Modify: `tests/transcriptionService.test.mjs`
- Add: `tests/voiceInputPrivateRpc.test.mjs`

**Step 1: 更新前端源码约束测试**

- 让 `voiceInputUi.test.mjs` 断言前端改为依赖 `voiceInputRpc.ts`
- 断言不再直接请求 `/api/voice-input-capability`
- 断言不再直接请求 `/api/transcriptions`

**Step 2: 新增 bridge 私有 RPC 测试**

- 增加 `voiceInputPrivateRpc.test.mjs`
- 断言 `codexAppServerBridge.ts` 中存在：
  - `web-local/voice-input/capability/read`
  - `web-local/voice-input/transcription/create`
- 断言私有 RPC 在 bridge 层而不是正式 schema 中实现

**Step 3: 运行测试并确认当前实现失败**

Run: `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/voiceInputPrivateRpc.test.mjs`

Expected: FAIL，失败原因是当前仍在使用 HTTP route / gateway。

### Task 2: 在 bridge 中新增私有 RPC 分发

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/server/transcriptionService.ts`

**Step 1: 在 `rpc()` 中增加私有方法拦截**

- 新增私有分发函数，例如：
  - `handlePrivateRpc(method, params)`
- 命中 `web-local/voice-input/*` 时本地处理
- 未命中则保持原来的 `this.call(method, params)`

**Step 2: 实现 `capability/read`**

- 返回：
  - `fallbackEnabled`
  - `provider`
  - `model`
  - `maxAudioBytes`
  - `acceptedMimeTypes`

**Step 3: 实现 `transcription/create`**

- 校验 `audioBase64`、`contentType`、`language`
- 解码 base64
- 调用现有 OpenAI 转写逻辑
- 返回 `{ text, provider, model }`

**Step 4: 统一错误码**

- 用现有 JSON-RPC 错误格式返回：
  - `-32602`
  - `-32010` ~ `-32016`

### Task 3: 删除裸 HTTP 语音接口

**Files:**
- Modify: `src/server/httpServer.ts`

**Step 1: 删除语音能力与转写 HTTP 路由**

- 移除：
  - `GET /api/voice-input-capability`
  - `POST /api/transcriptions`

**Step 2: 保留运行时配置传递**

- 仍让 HTTP server / bridge 拿到 `voiceInputFallback` 配置
- 但不再通过独立 HTTP route 暴露

### Task 4: 前端切到私有 RPC 调用

**Files:**
- Delete: `src/api/transcriptionGateway.ts`
- Add: `src/api/voiceInputRpc.ts`
- Modify: `src/components/content/ThreadComposer.vue`

**Step 1: 新增前端 RPC 调用封装**

- 在 `voiceInputRpc.ts` 中实现：
  - `readVoiceInputCapability()`
  - `createVoiceInputTranscription()`

**Step 2: 组件改为通过 RPC 调用**

- 将初始化能力探测改为 `readVoiceInputCapability()`
- 将 fallback 转写提交改为 `createVoiceInputTranscription()`
- 将 `Blob` 转成 base64 后放入 RPC 参数

**Step 3: 保持 UI 行为不变**

- 继续只在无原生识别时使用 fallback
- 继续只回填草稿
- 继续保留现有录音状态机

### Task 5: 同步契约与运行文档

**Files:**
- Add: `docs/contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md`
- Modify: `docs/contracts/README.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/plans/2026-04-11-web-local-voice-private-rpc-design.md`
- Modify: `docs/plans/2026-04-11-web-local-voice-private-rpc-implementation-plan.md`

**Step 1: 写明这是私有 RPC**

- 明确它不属于 upstream app-server 正式 schema
- 明确方法名和字段仅在 `codex-web-local` bridge 内部生效

**Step 2: 更新运行说明**

- 从“本地 HTTP 语音接口”改为“bridge 私有 RPC 语音接口”
- 运行环境开关仍保持：
  - `OPENAI_API_KEY`
  - `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1`

### Task 6: 验证并回填执行结果

**Files:**
- Modify: `docs/plans/2026-04-11-web-local-voice-private-rpc-implementation-plan.md`

**Step 1: 运行验证**

Run: `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/voiceInputPrivateRpc.test.mjs`

Run: `npm run build`

Run: `rg -n "web-local/voice-input|/api/transcriptions|/api/voice-input-capability" src tests docs`

Expected:

- 私有 RPC 字符串存在
- 裸 HTTP 语音接口不再存在
- 构建通过

**Step 2: 回填计划结果**

- 写入实际修改文件
- 写入验证记录
- 写入偏差与后续待办

## 验收与验证

- 前端语音 fallback 只通过 `/codex-api/rpc` 调用
- `src/server/httpServer.ts` 不再注册语音专用 HTTP route
- `src/server/codexAppServerBridge.ts` 能处理 `web-local/voice-input/*`
- `documentation/app-server-schemas/` 无改动
- `src/api/appServerDtos.ts` 无改动
- `npm run build` 通过

## Notes

- 本计划默认不包含 `git add` / `git commit`
- 若 base64 音频体积成为问题，应另写计划评估二进制上传通道
- 如未来要上游化，应新写正式协议设计与 schema 迁移计划

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/server/codexAppServerBridge.ts`
- `src/server/httpServer.ts`
- `src/server/transcriptionService.ts`
- `src/api/voiceInputRpc.ts`
- `src/components/content/ThreadComposer.vue`
- `tests/voiceInputUi.test.mjs`
- `tests/transcriptionService.test.mjs`
- `tests/voiceInputPrivateRpc.test.mjs`
- `docs/contracts/README.md`
- `docs/contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md`
- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`
- `docs/plans/2026-04-11-web-local-voice-private-rpc-implementation-plan.md`

**验证记录:**
- `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/voiceInputPrivateRpc.test.mjs`：PASS
- `node --test tests/voiceInputUi.test.mjs tests/transcriptionService.test.mjs tests/voiceInputPrivateRpc.test.mjs tests/cliVoiceInputConfig.test.mjs`：PASS
- `npm run build`：PASS

**实际结果摘要:**
- 现有 OpenAI 语音 fallback 已从本地 HTTP 路由迁移到 `web-local/voice-input/*` 私有 RPC
- `src/server/httpServer.ts` 不再暴露语音专用 HTTP route
- 正式 app-server schema 与 `src/api/appServerDtos.ts` 保持不变

**与计划偏差:**
- 为减少前端接线改动，录音 `Blob -> base64` 的转换封装在 `src/api/voiceInputRpc.ts`，而不是继续放在组件内。
- `/codex-api/rpc` 仍沿用现有 HTTP envelope，私有 RPC 错误码通过 HTTP 错误响应体中的 `{ error: { code, message } }` 返回，没有额外引入完整 JSON-RPC error envelope 重构。

**后续待办:**
- 如 base64 传输成本偏高，可单独评估二进制上传版私有通道
