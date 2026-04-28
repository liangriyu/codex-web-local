# Turn File Change Card Aggregation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让同一 `turn` 的文件变更只展示一张聚合卡片，挂在该 `turn` 最后一条 assistant 消息后面，并为每个文件提供显式 `查看 Diff` 入口，同时保留最新一组变更的撤销 / 重新应用能力。

**Architecture:** 复用现有 turn 级文件变更时间线和 latest reversible 状态，只调整前端消息挂载规则和单文件 diff 交互语义。卡片渲染从“按消息命中即展示”改为“只在该 turn 最后一条 assistant 消息后展示一次”，文件行改为显式按钮打开历史单文件 diff。

**Tech Stack:** Vue 3、TypeScript、computed helpers、CodePreviewPanel、Node `node:test`

---

### Task 1: 先为同 turn 聚合挂载写失败测试

**Files:**
- Modify: `tests/threadFileChangesTimelineUi.test.mjs`

**Step 1: 补一个同 turn 多条 assistant 消息的模板样本**

- 构造两个共享同一 `turnId` 的 assistant 消息
- 同时给该 `turnId` 一条文件变更记录

**Step 2: 断言卡片只渲染一次**

- 断言不会对同一 `turnId` 的每条 assistant 消息都渲染卡片

**Step 3: 断言卡片挂在最后一条 assistant 消息后面**

- 以 AST 或稳定结构检查，不依赖脆弱字符串位置

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesTimelineUi.test.mjs`
Expected: FAIL，当前实现会对同一 `turnId` 的多条消息重复命中

### Task 2: 为显式单文件 Diff 入口写失败测试

**Files:**
- Modify: `tests/threadFileChangesUndoUi.test.mjs`

**Step 1: 增加卡片内显式按钮检查**

- 断言 `ThreadConversation.vue` 中存在 `查看 Diff` 相关文案键
- 断言文件行不再只依赖整行隐式点击

**Step 2: 断言历史 diff 仍然通过显式事件打开**

- 保持对 `open-file-diff` 的检查
- 增加“按钮级触发”的结构检查

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesUndoUi.test.mjs`
Expected: FAIL，当前实现没有显式 `查看 Diff` 按钮

### Task 3: 改造消息挂载逻辑，只在 turn 最后一条 assistant 消息后渲染一次

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`

**Step 1: 增加辅助函数**

- 计算某条消息是否是该 `turnId` 下最后一条 assistant 消息
- 将“读取文件变更记录”和“判断是否应在此消息后渲染”拆开

**Step 2: 修改模板判断**

- 卡片渲染条件从 `readMessageFileChanges(message)` 改为新的聚合判断

**Step 3: 保持现有撤销 / 重放按钮只挂在这张聚合卡片上**

- 不改变 latest reversible 的业务边界

### Task 4: 增加显式 `查看 Diff` 按钮并保留右侧预览面板

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 调整文件行结构**

- 路径与统计保留在左侧
- 新增右侧 `查看 Diff` 按钮

**Step 2: 调整文案**

- 新增 `threadConversation.viewFileChangeDiff`
- 文案明确表达这是“查看本次会话的单文件 Diff”

**Step 3: 保持事件出口不变**

- 点击按钮仍然触发 `open-file-diff`
- 避免扩大这轮改动范围到 `App.vue` 以外

### Task 5: 明确历史单文件 Diff 与 workspace diff 的语义

**Files:**
- Modify: `src/App.vue`

**Step 1: 检查当前 `onOpenFileDiff` 的预览上下文**

- 确认历史单文件 diff 不会误触 workspace diff 面板逻辑

**Step 2: 如有必要，补充标题/上下文信息**

- 明确这是历史 turn file diff

**Step 3: 不重构整体预览模型**

- 仅做本轮必要的语义修正

### Task 6: 运行回归验证并回填文档

**Files:**
- Modify: `docs/plans/2026-04-07-turn-file-change-card-aggregation-design.md`
- Modify: `docs/plans/2026-04-07-turn-file-change-card-aggregation-implementation-plan.md`

**Step 1: 运行目标测试**

Run: `node --test tests/threadFileChangesTimelineUi.test.mjs tests/threadFileChangesUndoUi.test.mjs`
Expected: PASS

**Step 2: 运行已有回归测试**

Run: `node --test tests/threadFileChangesFallback.test.mjs tests/threadFileChangesPersistence.test.mjs tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 4: 回填实际结果**

- 记录最终改动文件
- 记录验证命令和结果
- 记录是否有后续待办

## Notes

- 本轮不改变服务端历史 diff 数据模型
- 本轮不引入 turn 分组视图，只做“最后一条 assistant 消息后挂一次”
- 按仓库约定，本计划默认不包含 `git add` / `git commit`

## Related Docs

- 设计文档：[2026-04-07-turn-file-change-card-aggregation-design.md](./2026-04-07-turn-file-change-card-aggregation-design.md)
- 现有时间线方案：[2026-04-07-turn-file-changes-timeline-design.md](./2026-04-07-turn-file-changes-timeline-design.md)
