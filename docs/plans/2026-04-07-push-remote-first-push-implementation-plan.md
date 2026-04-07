# First Push Upstream Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 web 版“推送远端”在当前分支无 upstream 时也可直接推送，并自动建立 upstream。

**Architecture:** 沿用现有 bridge + Git CLI + workspace push state 架构，不改入口，只把无 upstream 场景从“仅提示命令”升级为“允许点击并执行 `git push --set-upstream <remote> <branch>`”。前端根据服务端新增的 `willSetUpstream` / `canPush` 语义调整按钮与文案。

**Tech Stack:** Vue 3、TypeScript、Express middleware、Node `execFile`、Git CLI、Node `node:test`

---

### Task 1: 先补 bridge 侧失败测试

**Files:**
- Modify: `tests/codexAppServerBridge.test.mjs`

**Step 1: 为无 upstream 状态写预检断言**

- 断言 `GET /codex-api/git/push/status` 在无 upstream 时返回：
  - `hasUpstream: false`
  - `willSetUpstream: true`
  - `canPush: true`（guard 未阻塞时）

**Step 2: 为首次 push 写执行断言**

- 断言 `POST /codex-api/git/push` 在无 upstream 场景会执行 `git push --set-upstream ...`
- 断言成功返回 `createdUpstream: true`

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: FAIL，当前实现仍把无 upstream 视为不可推送

### Task 2: 调整 bridge 的 push 状态与执行逻辑

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 扩展 push metadata**

- 增加 `willSetUpstream`
- 调整无 upstream 时 `canPush` 的语义

**Step 2: 改造 push 执行函数**

- 已有 upstream：`git push`
- 无 upstream：`git push --set-upstream <suggestedRemote> <currentBranch>`

**Step 3: 补成功结果摘要**

- 返回 `createdUpstream`
- 返回最终 remote / branch

### Task 3: 接入前端类型和网关

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 扩展 push status / result 类型**

- 增加 `willSetUpstream`
- 增加 `createdUpstream`

**Step 2: 适配网关 normalizer**

- 确保新字段可被前端读取
- 保持旧字段兼容

### Task 4: 调整状态层与 UI 展示

**Files:**
- Modify: `src/composables/useDesktopState.ts`
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 状态层透传新字段**

- 不改变现有 push 刷新时机
- 只补充 `willSetUpstream` 和 `createdUpstream` 的消费

**Step 2: 修改按钮显隐**

- 无 upstream 且 `canPush` 时显示按钮
- 按钮文案改为“推送并关联远端”

**Step 3: 保留辅助命令说明**

- 继续显示建议命令，但不再是唯一操作方式

### Task 5: 回归测试与构建验证

**Files:**
- Modify: `tests/pushRemoteUi.test.mjs`
- Modify: `docs/plans/2026-04-07-push-remote-first-push-design.md`
- Modify: `docs/plans/2026-04-07-push-remote-first-push-implementation-plan.md`

**Step 1: 为 UI 写无 upstream 可点击测试**

- 锁定 `ThreadComposer` 对无 upstream 场景的文案和按钮逻辑

**Step 2: 跑相关测试**

Run: `node --test tests/codexAppServerBridge.test.mjs tests/pushRemoteUi.test.mjs`
Expected: PASS

**Step 3: 跑构建**

Run: `npm run build`
Expected: PASS

**Step 4: 回填执行结果**

- 记录实际变更文件
- 记录验证命令
- 记录是否有与上一版方案的偏差

## Notes

- 首版仍不支持选择 remote / branch
- 首版仍不支持 force push
- 这是对上一版 push 方案的行为升级，不是新入口

## Related Docs

- 设计文档：[2026-04-07-push-remote-first-push-design.md](./2026-04-07-push-remote-first-push-design.md)

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/server/codexAppServerBridge.ts`
- `src/types/codex.ts`
- `src/api/codexGateway.ts`
- `src/components/content/ThreadComposer.vue`
- `src/i18n/uiText.ts`
- `tests/codexAppServerBridge.test.mjs`
- `tests/pushRemoteUi.test.mjs`
- `docs/plans/2026-04-07-push-remote-first-push-implementation-plan.md`

**验证记录:**
- `node --test tests/codexAppServerBridge.test.mjs`：PASS
- `node --test tests/pushRemoteUi.test.mjs`：PASS
- `node --test tests/codexAppServerBridge.test.mjs tests/pushRemoteUi.test.mjs`：PASS（12/12）
- `npm run build`：PASS

**实际结果摘要:**
- 无 upstream 时，push 状态改为 `willSetUpstream=true` 且 `canPush=true`
- `POST /codex-api/git/push` 在无 upstream 场景会执行 `git push --set-upstream <remote> <branch>`
- 前端 branch 菜单现在会显示“推送并关联远端”
- push 成功后会返回 `createdUpstream=true`

**与计划偏差:**
- 未新增独立状态管理逻辑，复用了现有 push state，仅扩展字段语义
- 文案仍保留建议命令，用作辅助说明，而不是唯一操作路径
