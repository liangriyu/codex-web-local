# Shared Session And File Changes Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 收敛文件变更持久化、shared session 审批语义和调试日志边界，避免刷新恢复链路脆弱、审批文案误导和产线日志越界。

**Architecture:** 保持现有消息流与组件结构不变，分别在前端本地存储层、shared session projector/snapshot 层和消费 UI 层做增量修正。文件变更只持久化摘要快照；shared session 拆分 approval 与 attention 计数；调试日志改成开发态或显式开关。

**Tech Stack:** Vue 3、TypeScript、Node `node:test`、浏览器 `localStorage`、shared session projector/snapshot

---

### Task 1: 固定文件变更摘要持久化边界

**Files:**
- Create: `docs/plans/2026-04-05-shared-session-file-changes-hardening-design.md`
- Create: `docs/plans/2026-04-05-shared-session-file-changes-hardening-implementation-plan.md`
- Modify: `src/composables/desktop-state/storage.ts`
- Modify: `src/composables/useDesktopState.ts`
- Test: `tests/threadFileChangesPersistence.test.mjs`

**Step 1: 为摘要结构写失败测试**

在 `tests/threadFileChangesPersistence.test.mjs` 中增加断言：

- 本地存储只保留摘要字段，不包含完整 `diff`
- 存储层写入失败时不会抛出未处理异常
- 超过最大条目数时会淘汰旧线程记录

**Step 2: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesPersistence.test.mjs`
Expected: FAIL，表现为当前实现仍持久化完整 `diff` 且无异常兜底

**Step 3: 实现摘要结构与安全边界**

在 `src/composables/desktop-state/storage.ts` 中：

- 定义文件变更摘要存储结构与版本号
- 为 `load/save/remove` 增加 `try/catch`
- 加入最大线程数与淘汰逻辑

在 `src/composables/useDesktopState.ts` 中：

- 从完整 `UiTurnFileChanges` 提取摘要后再写入存储
- 刷新恢复时优先恢复摘要卡片
- 保持内存态仍可使用完整 diff

**Step 4: 重新运行测试**

Run: `node --test tests/threadFileChangesPersistence.test.mjs`
Expected: PASS

### Task 2: 拆分 shared session 的 approval 与 attention 语义

**Files:**
- Modify: `src/server/sharedSessionProjector.ts`
- Modify: `src/server/sharedSessionSnapshot.ts`
- Modify: `src/components/content/SharedSessionStatusCard.vue`
- Modify: `src/components/sidebar/SidebarThreadTree.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/sharedSessionProjector.test.mjs`
- Test: `tests/sharedSessionStatusCard.test.mjs`
- Test: `tests/sidebarSharedSessionOverview.test.mjs`

**Step 1: 为新语义写失败测试**

在测试中增加断言：

- 非审批类 request 不再计入 `pendingApprovalCount`
- shared session snapshot 能单独表达 attention 计数
- UI 仅在真实审批存在时显示“待审批/待授权”
- 非审批 attention 使用“待处理请求/需要关注”语义

**Step 2: 运行测试并确认先失败**

Run: `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: FAIL，表现为当前实现仍把非审批 request 计入 approval

**Step 3: 实现 projector 与 UI 语义拆分**

在 `src/server/sharedSessionProjector.ts` 中：

- 明确审批类 method 判定
- 分别累计 approval 与 attention

在 `src/server/sharedSessionSnapshot.ts` 中：

- 增加 attention 相关字段，保持旧字段兼容直到 UI 全部切换

在 UI 文件中：

- 用 approval 与 attention 分流状态标签和文案
- 保留 persisted-only 遗留记录的既有语义

**Step 4: 重新运行测试**

Run: `node --test tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

### Task 3: 将文件变更调试日志改成显式开关

**Files:**
- Modify: `src/composables/desktop-state/storage.ts`
- Modify: `src/composables/useDesktopState.ts`
- Test: `tests/threadFileChangesPersistence.test.mjs`

**Step 1: 为日志开关写失败测试**

在 `tests/threadFileChangesPersistence.test.mjs` 中增加断言：

- 默认情况下不会触发调试日志
- 开启 debug flag 后才输出调试事件

**Step 2: 运行测试并确认先失败**

Run: `node --test tests/threadFileChangesPersistence.test.mjs`
Expected: FAIL，表现为当前日志硬编码开启

**Step 3: 实现 debug flag**

在相关文件中：

- 使用 `import.meta.env.DEV` 或显式 storage flag 控制日志
- 将 threadId / turnId 日志降敏为短前缀
- 删除常驻调试输出

**Step 4: 重新运行测试**

Run: `node --test tests/threadFileChangesPersistence.test.mjs`
Expected: PASS

### Task 4: 全链路回归

**Files:**
- Modify: `docs/plans/2026-04-05-shared-session-file-changes-hardening-implementation-plan.md`

**Step 1: 运行相关测试**

Run: `node --test tests/threadFileChangesPersistence.test.mjs tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录实际修改文件
- 记录验证命令与结果
- 记录与计划偏差

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `docs/plans/2026-04-05-shared-session-file-changes-hardening-design.md`
- `docs/plans/2026-04-05-shared-session-file-changes-hardening-implementation-plan.md`
- `src/App.vue`
- `src/api/codexGateway.ts`
- `src/components/content/SharedSessionStatusCard.vue`
- `src/components/content/ThreadConversation.vue`
- `src/composables/desktop-state/storage.ts`
- `src/composables/useDesktopState.ts`
- `src/i18n/uiText.ts`
- `src/server/sharedSessionProjector.ts`
- `src/server/sharedSessionSnapshot.ts`
- `src/types/codex.ts`
- `tests/sharedSessionBridge.test.mjs`
- `tests/sharedSessionProjector.test.mjs`
- `tests/sharedSessionStatusCard.test.mjs`
- `tests/sharedSessionStore.test.mjs`
- `tests/sharedSessionUi.test.mjs`
- `tests/threadFileChangesPersistence.test.mjs`

**验证记录:**
- `node --test tests/threadFileChangesPersistence.test.mjs tests/sharedSessionProjector.test.mjs tests/sharedSessionStatusCard.test.mjs tests/sidebarSharedSessionOverview.test.mjs tests/sharedSessionBridge.test.mjs tests/sharedSessionStore.test.mjs tests/sharedSessionUi.test.mjs`：PASS
- `npm run build`：PASS

**与计划偏差:**
- `src/components/sidebar/SidebarThreadTree.vue` 本轮未改。原因是侧栏“待审批”提示本来就基于 `isApprovalRequestMethod` 过滤 live request，不存在这次要修的 approval 语义膨胀问题。
- 额外补改了 `src/App.vue`、`src/api/codexGateway.ts`、`src/types/codex.ts`。原因是 approval 计数需要在 UI 接线处改为真实审批数，同时 shared-session snapshot 新增 `pendingAttentionCount` 后，需要同步补齐前端类型和 gateway 归一化逻辑。
- 文件变更摘要恢复保留了现有 `UiTurnFileChanges` 内存结构，通过在加载时把缺失 `diff` 还原为空字符串实现兼容；同时在 `ThreadConversation` 与 `App.vue` 层阻断了“打开空 diff”的误导路径，没有额外重构预览面板。
- 补做真实浏览器回归时，需使用受控文件改动样本验证“刷新前后摘要卡片一致”，因为 `thread/read` 不返回可直接重建文件变更卡片的服务端 item。
- 继续做自动化取证时，优先验证浏览器是否真的写入 `thread-file-changes.v2`，再判断是否存在刷新读取问题。
- 若浏览器存储始终为空，需要继续对照 `/codex-api/events`，确认 `turn/diff/updated` 是否真实到达前端。
- 若事件流中缺少 `turn/diff/updated`，则问题优先级高于 localStorage 读取，因为前端根本没有摘要来源。
- app-server 真样本验证中。
