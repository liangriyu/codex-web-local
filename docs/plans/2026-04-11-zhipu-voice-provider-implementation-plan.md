# 智谱语音 Provider 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为语音 fallback 增加智谱 ASR provider，同时保留现有 OpenAI provider，通过环境变量选择当前 provider。

**Architecture:** 保持前端与私有 RPC `web-local/voice-input/*` 不变，只在服务端增加 provider 化的转写能力。`runtimeConfig` 统一归一化 provider 与 API key，`transcriptionService` 负责按 provider 分发到 OpenAI 或智谱，并向 bridge 暴露统一错误语义。

**Tech Stack:** Vue 3、TypeScript、Node fetch/FormData、Express bridge、Node test、Vite

---

### Task 1: 先收紧配置测试

**Files:**
- Modify: `tests/cliVoiceInputConfig.test.mjs`
- Modify: `src/cli/runtimeConfig.ts`

**Step 1: 写失败测试**

- 增加以下断言：
  - 默认 provider 为 `openai`
  - 配置 `CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER=zhipu` 时会返回 `provider: 'zhipu'`
  - `zhipu` 只在 `ZHIPU_API_KEY + CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED` 同时满足时启用
  - `openai` 现有行为不回归

**Step 2: 运行测试并确认失败**

Run: `node --test tests/cliVoiceInputConfig.test.mjs`

Expected: FAIL，原因是当前配置归一化只支持 OpenAI。

**Step 3: 最小实现**

- 扩展 `VoiceInputFallbackConfig`：
  - `provider: 'openai' | 'zhipu'`
  - `model: string`
- 在 `normalizeVoiceInputFallbackConfig()` 中增加 provider 与智谱变量归一化

**Step 4: 重新运行测试**

Run: `node --test tests/cliVoiceInputConfig.test.mjs`

Expected: PASS

### Task 2: 为转写服务写 provider 测试

**Files:**
- Modify: `tests/transcriptionService.test.mjs`
- Modify: `src/server/transcriptionService.ts`

**Step 1: 写失败测试**

- 增加以下断言：
  - `getCapability()` 返回当前 provider 与 model
  - `provider=openai` 时仍走 OpenAI 路径
  - `provider=zhipu` 时走智谱路径
  - 智谱上游错误可被映射为统一 `TranscriptionServiceError`

**Step 2: 运行测试并确认失败**

Run: `node --test tests/transcriptionService.test.mjs`

Expected: FAIL，原因是当前服务只支持 OpenAI。

**Step 3: 最小实现**

- 将 `createTranscriptionService()` 改为 provider 化
- 保留公共校验：
  - 空音频
  - 体积限制
  - MIME 白名单
- 新增：
  - `transcribeAudioWithZhipu()`
  - 智谱返回文本提取
  - 智谱错误到统一错误的映射

**Step 4: 重新运行测试**

Run: `node --test tests/transcriptionService.test.mjs`

Expected: PASS

### Task 3: 覆盖 bridge 私有 RPC 行为

**Files:**
- Modify: `tests/voiceInputPrivateRpc.test.mjs`
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 写失败测试**

- 断言 `web-local/voice-input/capability/read` 返回当前 provider 与 model
- 断言 `web-local/voice-input/transcription/create` 在 provider 为 `zhipu` 时仍能返回统一 envelope
- 断言额度不足或上游失败仍映射到统一私有错误码

**Step 2: 运行测试并确认失败**

Run: `node --test tests/voiceInputPrivateRpc.test.mjs`

Expected: FAIL，原因是当前 bridge 只按 OpenAI 路径映射错误。

**Step 3: 最小实现**

- 调整 bridge 中的 provider/错误分支，使其不再绑定 OpenAI 文案
- 对智谱额度不足、限流、无文本结果映射到现有统一错误语义

**Step 4: 重新运行测试**

Run: `node --test tests/voiceInputPrivateRpc.test.mjs`

Expected: PASS

### Task 4: 同步前端展示默认值与文案

**Files:**
- Modify: `src/api/voiceInputRpc.ts`
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 写失败测试**

- 若现有 `tests/voiceInputUi.test.mjs` 已覆盖 provider/model 展示默认值，补智谱场景断言
- 若未覆盖，增加最小断言：
  - capability 返回 `provider: zhipu` 时，前端不会因默认 `openai` 值导致错误分支

**Step 2: 运行测试并确认失败**

Run: `node --test tests/voiceInputUi.test.mjs`

Expected: FAIL 或缺少覆盖。

**Step 3: 最小实现**

- `voiceInputRpc.ts` 默认 provider 文案改为“以服务端返回为准”，不硬编码只认 OpenAI
- 若前端错误文案中含 OpenAI 专属文案，改成 provider 无关表达；仅额度不足文案可保留泛化描述

**Step 4: 重新运行测试**

Run: `node --test tests/voiceInputUi.test.mjs`

Expected: PASS

### Task 5: 补运行文档与契约文档

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md`
- Modify: `docs/plans/2026-04-11-zhipu-voice-provider-design.md`
- Modify: `docs/plans/2026-04-11-zhipu-voice-provider-implementation-plan.md`

**Step 1: 更新运行说明**

- 写清 provider 选择方式
- 写清 OpenAI / 智谱各自所需环境变量
- 说明当前前端和私有 RPC 契约不变

**Step 2: 更新契约文档**

- 在私有 RPC 契约里说明 `provider` 可能是 `openai` 或 `zhipu`

**Step 3: 回填计划执行结果**

- 在实施完成后补充实际修改文件、验证命令和结果

### Task 6: 全量验证

**Files:**
- Test only

**Step 1: 运行定向测试**

Run: `node --test tests/cliVoiceInputConfig.test.mjs tests/transcriptionService.test.mjs tests/voiceInputPrivateRpc.test.mjs tests/voiceInputUi.test.mjs`

Expected: PASS

**Step 2: 运行构建验证**

Run: `npm run build`

Expected: PASS

**Step 3: 记录结果**

- 将通过情况补到本计划“执行结果”部分

---

## Notes

- 首版只做 provider 可选，不做自动回退
- 不改正式 app-server schema
- 不新增 CLI 参数，继续使用环境变量控制 provider
- 本计划默认不包含 `git add` / `git commit`

## Related Docs

- 设计文档：[2026-04-11-zhipu-voice-provider-design.md](./2026-04-11-zhipu-voice-provider-design.md)

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/cli/runtimeConfig.ts`
- `src/server/transcriptionService.ts`
- `src/server/codexAppServerBridge.ts`
- `src/server/httpServer.ts`
- `src/components/content/ThreadComposer.vue`
- `src/i18n/uiText.ts`
- `README.md`
- `README.zh-CN.md`
- `docs/runtime/README.md`
- `docs/contracts/WEB_LOCAL_PRIVATE_RPC.zh-CN.md`
- `docs/plans/2026-04-11-zhipu-voice-provider-design.md`
- `docs/plans/2026-04-11-zhipu-voice-provider-implementation-plan.md`
- `tests/cliVoiceInputConfig.test.mjs`
- `tests/transcriptionService.test.mjs`
- `tests/voiceInputPrivateRpc.test.mjs`
- `tests/voiceInputUi.test.mjs`

**验证记录:**
- `node --test tests/cliVoiceInputConfig.test.mjs tests/transcriptionService.test.mjs tests/voiceInputPrivateRpc.test.mjs tests/voiceInputUi.test.mjs`：PASS
- `npm run build`：PASS

**实际结果摘要:**
- 语音 fallback 已支持 `openai` 与 `zhipu` 双 provider
- provider 通过环境变量 `CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER` 选择
- OpenAI 继续使用 `gpt-4o-mini-transcribe`
- 智谱默认使用 `glm-asr-2512`
- 私有 RPC 方法名、前端交互和线程协议保持不变
- 为兼容智谱官方上传格式限制，前端在命中智谱 provider 且录音 MIME 不兼容时，会先把浏览器录音转换成 `audio/wav` 再上传

**与原计划差异:**
- 相比最初计划，实际新增了一层浏览器侧 `wav` 转换，用于兼容智谱 API 当前对上传格式的限制

**后续待办:**
- 可补智谱真实错误码与额度错误的更精细映射
- 可补 provider 级联回退策略评估，但当前版本仍保持单 provider 显式选择
