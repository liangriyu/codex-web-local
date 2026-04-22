# 服务端语音转写回退实施计划

> ⚠️ **状态说明（已被后续方案覆盖）**  
> 本文描述的是 2026-04-10 的“回退到仅浏览器原生语音识别”阶段性方案。  
> 该方案已被后续私有 RPC 语音 fallback 设计与实现覆盖，请以以下文档为准：  
> - [docs/plans/2026-04-11-web-local-voice-private-rpc-design.md](./2026-04-11-web-local-voice-private-rpc-design.md)  
> - [docs/plans/2026-04-11-web-local-voice-private-rpc-implementation-plan.md](./2026-04-11-web-local-voice-private-rpc-implementation-plan.md)  
> - [docs/runtime/README.md](../runtime/README.md)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 回退服务端语音转文字能力与相关 CLI 配置，仅保留浏览器原生语音识别入口。

**Architecture:** 当前语音链路分为浏览器原生识别和浏览器录音上传到本地 `/api/transcriptions` 两条路径。本次回退删除服务端转写路由、本地 `whisper.cpp` 配置与前端录音回退逻辑，让输入器只在浏览器原生语音识别可用时展示语音按钮。

**Tech Stack:** Vue 3、TypeScript、Express、Commander、Node test、Vite、tsup

---

## 背景与范围

- 回退范围：
  - 删除 `/api/transcriptions` 服务端接口与本地转写服务实现。
  - 删除 `--stt-command`、`--stt-model`、`--stt-language`、`--stt-timeout-ms` CLI 参数及归一化配置。
  - 删除前端录音回退与上传转写逻辑。
  - 更新测试与运行文档。
- 非目标：
  - 本次不接入新的第三方 STT 服务。
  - 不调整线程消息协议，不改发送逻辑。
  - 不做无关 UI 优化。

## 风险与回滚

- 风险：
  - iPhone 浏览器会失去现有录音回退入口，语音按钮可能不再显示。
  - 相关文档若未同步，容易让用户继续尝试已删除的 CLI 参数。
- 回滚方式：
  - 可基于本次删除的文件与文档记录，恢复 `/api/transcriptions`、CLI 参数和前端 fallback 流程。

## 分步执行清单

### Task 1: 先收紧测试预期

**Files:**
- Modify: `tests/voiceInputUi.test.mjs`
- Modify: `tests/cliVoiceInputConfig.test.mjs`
- Modify: `tests/transcriptionService.test.mjs`

**Step 1: 编写回退后的测试预期**

- `voiceInputUi` 只断言原生语音识别链路存在，不再断言 `fallback`、`MediaRecorder`、`requestLocalTranscription`。
- `cliVoiceInputConfig` 只验证 HTTPS 配置与 URL 格式化。
- `transcriptionService` 改为断言服务端源码不再注册 `/api/transcriptions`。

**Step 2: 运行相关测试并确认失败**

Run: `node --test tests/voiceInputUi.test.mjs tests/cliVoiceInputConfig.test.mjs tests/transcriptionService.test.mjs`

Expected: FAIL，且失败点来自旧实现仍然包含服务端 STT 或 fallback 逻辑。

### Task 2: 删除服务端 STT 与前端 fallback

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/utils/voiceInput.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/cli/runtimeConfig.ts`
- Modify: `src/server/httpServer.ts`
- Delete: `src/api/transcriptionGateway.ts`
- Delete: `src/server/transcriptionService.ts`

**Step 1: 删除 CLI 配置入口**

- 从 `commander` 选项与运行时配置中移除 `--stt-*`。
- 让 `createServer` 只接收保留的运行参数。

**Step 2: 删除服务端转写能力**

- 从 `httpServer` 中删除 `/api/transcriptions` 路由与相关类型引用。
- 删除本地转写服务实现文件。

**Step 3: 删除前端 fallback 路径**

- `voiceInput.ts` 只保留原生语音识别能力探测。
- `ThreadComposer.vue` 去掉录音、上传、fallback 状态与按钮行为，只在原生识别可用时展示语音按钮。

### Task 3: 同步文档与计划结果

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/runtime/README.md`
- Modify: `docs/plans/2026-04-10-rollback-server-stt.md`

**Step 1: 移除已失效说明**

- 删除本地 STT、`whisper.cpp`、iPhone fallback、`--stt-*` 参数说明与示例。

**Step 2: 保留真实可用能力说明**

- 标明当前只保留浏览器原生语音识别。
- 说明 iPhone 浏览器语音输入后续建议通过第三方 STT 方案适配。

**Step 3: 回填计划执行结果**

- 记录实际完成项、验证命令和差异说明。

## 验收与验证

- 运行：`node --test tests/voiceInputUi.test.mjs tests/cliVoiceInputConfig.test.mjs tests/transcriptionService.test.mjs`
- 运行：`npm run build`
- 检查文档中已无 `--stt-command`、`--stt-model` 等失效参数说明。
- 检查源码中已无 `/api/transcriptions` 与 `requestLocalTranscription` 残留引用。

## 实际执行结果

- 已删除服务端 `/api/transcriptions` 路由与本地转写服务实现。
- 已删除 `--stt-*` CLI 参数与运行时转写配置。
- 已删除前端录音 fallback，仅保留浏览器原生语音识别入口。
- 已同步 `README.md`、`README.zh-CN.md`、`docs/runtime/README.md`。
- 已完成定向测试与构建验证。

## 与原计划差异

- 无实现偏差，按“最小回退”执行。

## 后续待办

- 评估并接入适合 iPhone 浏览器的第三方语音转文字 API。
