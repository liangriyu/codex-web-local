# Turn 级文件变更时间线与最新会话撤销能力设计

## 背景

当前仓库已经具备基础的文件变更展示能力，但这条链路仍然停留在“线程级最新摘要”阶段：

- 前端只为每个 `threadId` 保留一份最新 `UiTurnFileChanges`
- 文件变更卡片统一挂在线程消息列表末尾，而不是对应回复之后
- 刷新恢复主要依赖 `localStorage` 摘要与 session jsonl fallback
- 历史记录只能看到“最近一次改了哪些文件”，无法准确回答“是哪次回复改的”
- 当前卡片上的“完整 Diff”按钮打开的是当前工作区 diff，而不是该次历史回复的变更内容

这与 `codex app` 的体验存在明显差距。目标体验应当是：

- 文件变更卡片跟随对应那次 assistant 回复出现
- 历史上的每一次文件改动都能单独查看
- 能明确识别“当前线程最近一次有文件改动的回复”
- 对这一次回复，支持安全的撤销 / 重新应用

## 目标

- 将文件变更从“线程级最新摘要”升级为“turn 级历史时间线”
- 让 UI 能准确回答“是哪次回复改的”
- 支持查看单个历史回复对应的文件变更
- 为当前线程最近一次有文件改动的回复提供撤销 / 重新应用能力
- 保持旧线程可尽量回填历史卡片，但不强求所有旧记录都可逆执行

## 非目标

- 不支持任意历史 turn 的撤销 / 重新应用
- 不尝试实现 Git 层面的全局回滚、stash 管理或临时 commit 恢复
- 不在首版支持跨线程、跨工作区的“最近一次改动”操作
- 不要求所有旧 session 都能恢复完整 diff
- 不在本轮重做现有 workspace diff 面板本身

## 现状分析

### 1. 数据模型仍是 thread 级 latest，而不是 turn 级历史

当前 `selectedThreadFileChanges` 只从 `latestFileChangesByThreadId` 读取一份摘要。这意味着：

- 线程里多次文件修改时，只有最新一份可见
- 历史 turn 的位置信息丢失
- UI 只能在线程尾部展示卡片，无法和具体回复绑定

### 2. fallback 仅能恢复“最近一次摘要”，不能恢复时间线

`src/server/threadFileChangesFallback.ts` 目前会扫描 session jsonl 中的 `apply_patch`，但只返回最近一次 `UiTurnFileChanges`。它能用于“刷新后还能看见一张卡片”，不能支撑“历史多张卡片”。

### 3. 当前卡片与当前工作区 diff 混用了两套语义

消息区卡片来自历史 turn 摘要，但点击按钮会打开当前工作区 diff 面板。这会导致：

- 当前工作区已经干净时，历史卡片仍在
- 用户点击“完整 Diff”却看到的是当前工作区状态
- 历史变更与当前状态被误判为同一件事

### 4. 撤销 / 重新应用缺少可执行账本

当前只保存：

- `turnId`
- `files`
- `totalAdditions`
- `totalDeletions`

这些数据足够做展示，不足以做可逆执行。要支持 undo / reapply，至少还需要：

- 原始 patch 或可重建 patch 的依据
- 反向 patch
- 该 turn 当前是否已撤销
- 当前 turn 是否仍然是最新可逆变更

## 方案对比

### 方案 A：只补 turn 级历史卡片

做法：

- 改成 `thread -> many turn file changes`
- 卡片按 `turnId` 插入对应消息后面
- 只支持查看历史，不支持撤销 / 重新应用

优点：

- 改动相对集中
- 能解决“是哪次回复改的”

缺点：

- 无法满足“最新一次会话变更可撤销 / 重放”
- 后续再做可逆执行时需要再次重构数据层

### 方案 B：turn 级时间线 + patch ledger

做法：

- 前端维护 turn 级时间线
- 服务端维护当前线程最近一次文件改动的 patch ledger
- 历史卡片按 turn 挂载
- 最新一次文件改动 turn 支持撤销 / 重新应用

优点：

- 能同时覆盖“历史定位”与“最新可逆执行”
- 与 `codex app` 的 patch 语义更接近
- 后续可继续扩展到任意 turn 的只读历史查看

缺点：

- 首版改动范围较大
- 需要新建服务端 ledger 和状态模型

### 方案 C：历史卡片 + Git 层回滚

做法：

- 历史卡片按 turn 展示
- 撤销 / 重新应用依赖 stash、临时 commit 或 Git diff 拼装

优点：

- 表面实现快

缺点：

- 很难保证“只影响某次回复的改动”
- 容易与用户当前未提交改动互相污染
- 语义与 UI 展示边界不一致

结论：采用方案 B。

## 推荐设计

### 1. 核心建模

前端从：

- `threadId -> latest file change summary`

升级为：

- `threadId -> turn ordered file change records[]`

建议新增 UI 模型：

- `UiThreadTurnFileChangeRecord`
  - `threadId`
  - `turnId`
  - `files`
  - `totalAdditions`
  - `totalDeletions`
  - `createdAtIso`
  - `source`
  - `canUndo`
  - `canReapply`
  - `isLatestChangeTurn`
  - `isReverted`

- `UiThreadFileChangeTimeline`
  - `threadId`
  - `records[]`
  - `latestReversibleTurnId`

其中：

- 所有历史 turn 都可以有 `files` 摘要
- 只有当前线程最近一次可逆变更 turn 才允许 `canUndo` / `canReapply`

### 2. 服务端 patch ledger

服务端新增一条与当前 `thread-file-changes/fallback` 平行的能力，但不止返回摘要，而是维护最新可逆变更的 patch bundle。

建议内部模型：

- `ServerTurnPatchBundle`
  - `threadId`
  - `turnId`
  - `cwd`
  - `createdAtIso`
  - `source`
  - `patchText`
  - `reversePatchText`
  - `files`
  - `totalAdditions`
  - `totalDeletions`

数据来源：

- 实时 `turn/diff/updated` 优先用于展示
- session jsonl 中的 `apply_patch` 用于刷新恢复与 patch bundle 提取
- 首版只要求对 `apply_patch` 类文件修改提供可逆执行能力

关键约束：

- 旧历史 thread 可以只恢复摘要卡片
- 只有成功提取 patch bundle 的 latest change turn 才提供撤销 / 重放

### 3. 新增接口

建议新增 4 个接口。

只读：

- `GET /codex-api/thread-file-changes/timeline?threadId=...`
  - 返回当前线程所有可恢复的 turn 级文件变更记录
- `GET /codex-api/thread-file-changes/latest-reversible?threadId=...`
  - 返回当前线程最近一次可逆变更信息

写接口：

- `POST /codex-api/thread-file-changes/undo-latest`
  - 入参：`threadId`
- `POST /codex-api/thread-file-changes/reapply-latest`
  - 入参：`threadId`

服务端根据 `threadId` 自行定位：

- 当前线程最近一次文件改动 turn
- 是否存在可逆 patch bundle
- 当前是否已撤销

首版不开放“按任意 `turnId` 执行 undo / reapply`”，以避免过早引入历史顺序冲突。

### 4. undo / reapply 语义

推荐语义：

- `undo latest turn changes`
  - 对当前线程最近一次文件改动 turn 应用 `reversePatchText`
- `reapply latest turn changes`
  - 对当前线程最近一次文件改动 turn 重新应用 `patchText`

执行前统一门禁：

- 当前线程存在最近一次可逆变更
- 当前工作区必须干净
- 当前线程没有进行中的 turn
- 当前工作区没有待处理审批或遗留审批记录
- 目标 turn 仍然是该线程最近一次文件改动 turn

这是为了避免 patch 与用户当前工作区状态相互污染。

### 5. 失败语义

undo / reapply 应返回结构化错误码，至少包括：

- `no_reversible_turn`
- `workspace_not_clean`
- `thread_has_newer_change`
- `approval_blocked`
- `patch_conflict`

其中：

- `patch_conflict` 表示当前文件内容已不再匹配该 patch 的上下文，不能安全回放
- `thread_has_newer_change` 表示用户已经在该线程后续产生新的文件修改，旧最新 turn 不再可逆

### 6. 前端时间线渲染

消息流不再在线程末尾追加单独卡片，而是：

1. 遍历消息列表
2. 识别 assistant 回复所属 `turnId`
3. 若该 `turnId` 命中 `UiThreadTurnFileChangeRecord`
4. 在该条回复后渲染“本次回复修改了文件”的卡片

这样才能准确表达：

- 哪次回复改了文件
- 多次改动的先后顺序
- 最新可逆变更属于哪一条回复

### 7. 卡片交互

每张历史卡片包含：

- 标题：`N 个文件已更改 +A -D`
- 标签：`本次回复修改`
- 文件列表：支持查看单个文件变更
- 操作：
  - `查看本次变更`
  - 若为最新可逆变更：
    - `撤销本次变更`
    - `重新应用本次变更`（仅在已撤销状态）

按钮文案不再使用“完整 Diff”，避免与当前 workspace diff 混淆。

### 8. 与当前 workspace diff 面板的关系

保留现有 workspace diff 面板，它继续表达“当前工作区状态”。

历史卡片查看的内容应改成：

- 历史 turn 变更视图，或
- 复用预览面板但明确标记 `history-turn` 模式

不能再默认把历史卡片跳到当前 workspace diff。

### 9. 历史回填策略

按前面确认的边界，采用“尽量回填”：

- 新线程 / 新 turn：实时写入时间线与 latest reversible bundle
- 老线程：尽量从 session jsonl 回填历史卡片
- 回填失败的旧 turn：不展示卡片，或仅展示可恢复摘要
- 拿不到 patch bundle 的旧记录：只读，不提供撤销 / 重放

## 风险

### 1. patch bundle 来源不统一

当前稳定可依赖的是 `apply_patch`。如果某些真实文件改动来自其他事件类型，首版只能做摘要恢复，不能做可逆执行。

### 2. 历史 UI 与当前工作区状态可能分离

这是设计上刻意接受的行为。历史卡片表达的是某次回复的结果，不是当前 Git 状态。

### 3. reverse patch 失败

如果用户在该 turn 之后又改动了相关文件，或外部手工修改破坏了上下文，就可能出现 `patch_conflict`。首版必须明确阻断，而不是尝试“智能合并”。

### 4. 时间线恢复成本上升

从“latest 单值”升级到“历史数组”后，前端持久化与 session fallback 的复杂度都会上升，需要限制最大存储线程数和单线程保留记录数。

## 验收标准

- 某条 assistant 回复触发文件改动后，卡片出现在该回复后面，而不是线程底部
- 同一线程多次文件改动时，每次都有独立历史卡片
- 刷新页面后，历史卡片仍能按对应 `turnId` 恢复
- 点击历史卡片，查看的是该次回复的变更，而不是当前 workspace diff
- 当前线程最近一次文件改动卡片能显示“撤销本次变更”
- 撤销成功后，该卡片切换为“重新应用本次变更”
- 工作区不干净或存在阻塞条件时，撤销 / 重放按钮禁用并给出明确原因
- `npm run build` 通过

## 相关文档

- [2026-04-05-file-change-fallback-design.md](./2026-04-05-file-change-fallback-design.md)
- [2026-04-05-shared-session-file-changes-hardening-design.md](./2026-04-05-shared-session-file-changes-hardening-design.md)

