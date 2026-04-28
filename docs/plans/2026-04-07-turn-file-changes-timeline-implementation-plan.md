# Turn File Changes Timeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让文件变更卡片按对应 assistant 回复挂载，并为当前线程最近一次文件改动提供安全的撤销 / 重新应用能力。

**Architecture:** 在服务端新增 turn 级文件变更时间线读取与 latest reversible patch bundle 能力，前端从 thread 级 latest 单值模型升级为 turn 级时间线模型，消息流按 `turnId` 渲染历史卡片。撤销 / 重新应用只针对当前线程最近一次可逆变更，执行前要求工作区干净并复用现有线程/审批阻塞边界。

**Tech Stack:** Vue 3、TypeScript、Express middleware、Node `fs/promises`、session jsonl parser、Git CLI、Node `node:test`

---

### Task 1: 先为时间线模型写失败测试

**Files:**
- Modify: `tests/threadFileChangesFallback.test.mjs`
- Modify: `tests/threadFileChangesPersistence.test.mjs`
- Create: `tests/threadFileChangesTimelineUi.test.mjs`

**Step 1: 为 session fallback 写多 turn 时间线测试**

- 使用现有 `apply_patch` fixture 再补一个多 turn 样本
- 断言服务端不再只返回 latest，而是返回按时间排序的多条 turn 记录

**Step 2: 为前端持久化写时间线测试**

- 断言本地存储结构从 `thread -> latest` 升级为 `thread -> records[]`
- 断言刷新恢复后仍能按 `turnId` 读取历史记录

**Step 3: 为消息流挂载写 UI 失败测试**

- 断言文件变更卡片渲染在对应 assistant 回复后面
- 断言不再在线程末尾统一追加 latest 卡片

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesFallback.test.mjs tests/threadFileChangesPersistence.test.mjs tests/threadFileChangesTimelineUi.test.mjs`
Expected: FAIL，表现为当前实现仍只有 latest 单值模型，且卡片仍挂在线程尾部

### Task 2: 在类型层定义时间线与最新可逆变更模型

**Files:**
- Modify: `src/types/codex.ts`

**Step 1: 增加 turn 级文件变更记录类型**

- 新增 `UiThreadTurnFileChangeRecord`
- 新增 `UiThreadFileChangeTimeline`

**Step 2: 增加可逆执行状态类型**

- 为 latest reversible turn 增加 `canUndo`、`canReapply`、`isReverted`
- 为执行结果增加结构化错误码类型

**Step 3: 保持与现有 `UiChangedFile` 兼容**

- 尽量复用 `files / totalAdditions / totalDeletions`
- 避免本轮重做现有 diff 文件展示结构

### Task 3: 扩展服务端 fallback，返回 turn 级历史时间线

**Files:**
- Modify: `src/server/threadFileChangesFallback.ts`
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexRpcClient.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 为 session jsonl 增加 timeline parser**

- 从现有 latest summary parser 中抽出可复用逻辑
- 支持提取多条 `apply_patch` turn 记录，而不是只保留最后一条

**Step 2: 暴露新的只读接口**

- 新增 `GET /codex-api/thread-file-changes/timeline?threadId=...`
- 返回按时间排序的历史 turn 记录

**Step 3: 在前端网关补读取方法**

- 新增 `fetchThreadFileChangesTimeline(threadId)`
- 保持错误结构与现有 bridge 调用一致

### Task 4: 在状态层把 latest 单值改为 turn 级时间线

**Files:**
- Modify: `src/composables/desktop-state/storage.ts`
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 调整本地存储结构**

- 将 `codex-web-local.thread-file-changes.v2` 升级为新版本结构
- 只持久化历史摘要，不长期保存完整 diff

**Step 2: 调整内存状态**

- 用 `threadId -> timeline` 替换 `threadId -> latest`
- 保留按 `turnId` 快速查找的辅助函数

**Step 3: 兼容实时通知与刷新恢复**

- 收到 `turn/diff/updated` 时写入对应 turn 记录
- 刷新时通过 timeline 接口恢复
- 对旧缓存做安全回退

### Task 5: 改造消息流渲染，让卡片挂在对应回复后面

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Modify: `src/App.vue`

**Step 1: 建立消息与 turn 记录的映射**

- 以 assistant 回复的 `turnId` 为键
- 找到对应 `UiThreadTurnFileChangeRecord`

**Step 2: 把历史卡片插入消息流**

- 在对应消息项后渲染卡片
- 删除线程末尾统一 latest 卡片逻辑

**Step 3: 修正“查看本次变更”交互**

- 不再直接打开当前 workspace diff
- 历史卡片打开的应是该 turn 的历史变更视图

### Task 6: 为最新一次会话变更增加 latest reversible patch bundle

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/server/threadFileChangesFallback.ts`
- Modify: `tests/codexAppServerBridge.test.mjs`

**Step 1: 在服务端维护 latest reversible bundle**

- 从当前线程最近一次文件改动 turn 提取 `patchText`
- 生成并保存 `reversePatchText`

**Step 2: 暴露只读查询接口**

- 新增 `GET /codex-api/thread-file-changes/latest-reversible?threadId=...`
- 返回该线程当前最近一次可逆变更的状态

**Step 3: 为不可逆场景写测试**

- 覆盖无 patch bundle、无历史文件改动、存在新 turn 覆盖的场景

### Task 7: 先为 undo / reapply 写失败测试

**Files:**
- Modify: `tests/codexAppServerBridge.test.mjs`
- Create: `tests/threadFileChangesUndoUi.test.mjs`

**Step 1: 写服务端执行失败测试**

- `workspace_not_clean`
- `thread_has_newer_change`
- `patch_conflict`
- `no_reversible_turn`

**Step 2: 写前端按钮状态测试**

- 只有 latest reversible turn 显示按钮
- 已撤销后按钮切换为“重新应用本次变更”

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/threadFileChangesUndoUi.test.mjs`
Expected: FAIL，表现为接口与按钮状态尚未实现

### Task 8: 实现 undo / reapply 写接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `src/api/codexGateway.ts`
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 新增写接口**

- `POST /codex-api/thread-file-changes/undo-latest`
- `POST /codex-api/thread-file-changes/reapply-latest`

**Step 2: 实现执行前门禁**

- 工作区必须干净
- 当前线程无进行中 turn
- 无审批阻塞
- 目标仍是最新文件改动 turn

**Step 3: 更新状态层**

- 执行成功后刷新 latest reversible 状态
- 失败时保留结构化错误码与用户可读提示

### Task 9: 接入历史卡片操作与文案

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Modify: `src/App.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 增加卡片操作区**

- `查看本次变更`
- `撤销本次变更`
- `重新应用本次变更`

**Step 2: 明确区分历史变更与当前工作区 diff**

- 移除“完整 Diff”误导文案
- 为 blocked / conflict / reverted 状态补中文提示

**Step 3: 保证按钮只出现在 latest reversible turn 上**

- 历史 turn 只读
- latest reversible turn 根据状态切换按钮

### Task 10: 完整验证并回填文档

**Files:**
- Modify: `docs/plans/2026-04-07-turn-file-changes-timeline-design.md`
- Modify: `docs/plans/2026-04-07-turn-file-changes-timeline-implementation-plan.md`

**Step 1: 运行时间线与执行相关测试**

Run: `node --test tests/threadFileChangesFallback.test.mjs tests/threadFileChangesPersistence.test.mjs tests/threadFileChangesTimelineUi.test.mjs tests/codexAppServerBridge.test.mjs tests/threadFileChangesUndoUi.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录实际修改文件
- 记录验证命令和结果
- 记录计划偏差与后续待办

## Notes

- 首版只对“当前线程最近一次文件改动 turn”开放撤销 / 重放
- 旧历史记录允许只展示摘要，不强求都具备可逆执行能力
- 按仓库约定，本计划默认不包含 `git add` / `git commit`

## Related Docs

- 设计文档：[2026-04-07-turn-file-changes-timeline-design.md](./2026-04-07-turn-file-changes-timeline-design.md)

