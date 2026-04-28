# 文件变更摘要 Fallback 设计

## 背景

当前“刷新后恢复变更文件卡片”的实现依赖两类来源：

- 实时通知 `turn/diff/updated`
- `thread/read` 归一化后的 `fileChanges`

实际验证表明，这两类来源都不足以覆盖 `apply_patch` 型真实文件改动：

- 浏览器侧没有写入 `codex-web-local.thread-file-changes.v2`
- `thread/read` 返回的 turn items 只有 `userMessage` / `agentMessage`
- 真实 `turn/start` 产生了文件改动，但 session jsonl 中记录的是 `custom_tool_call apply_patch`，不是当前前端可消费的 `turn_diff`

因此，问题不在 `localStorage`，而在“刷新后缺少可恢复的摘要来源”。

## 目标

- 为刷新后的文件变更卡片补一条稳定的 fallback 来源
- 覆盖 `apply_patch` / patch 事件驱动的真实文件改动
- 只恢复摘要，不引入完整 diff 持久化
- 保持现有 UI 语义不变：无 diff 摘要不可点开完整 diff

## 非目标

- 不修改 app-server 协议
- 不要求上游稳定产出 `turn/diff/updated`
- 不从 session jsonl 恢复完整 diff 文本
- 不重做文件预览面板或消息渲染结构

## 方案对比

### 方案 A：继续等待上游 diff 事件

优点：

- 结构最干净
- 无需新增解析逻辑

缺点：

- 当前仓库无法控制
- 已有真实样本证明不能满足当前问题

### 方案 B：从 session jsonl 提取 fallback 摘要

优点：

- 当前仓库内可落地
- 能覆盖 `custom_tool_call apply_patch`
- 只恢复摘要，和现有 summary-only 持久化方向一致

缺点：

- 需要新增服务端解析层
- 只能恢复文件列表与统计，不能恢复完整 diff

### 方案 C：前端放弃刷新恢复

优点：

- 改动最小

缺点：

- 直接放弃目标能力
- 与当前问题背景相悖

结论：采用方案 B。

## 推荐方案

### 1. 新增服务端 fallback 摘要接口

新增只读接口，例如：

- `GET /codex-api/thread-file-changes/fallback?threadId=<id>`

接口职责：

- 定位线程对应的 session jsonl
- 从最新 turn 逆序扫描文件改动相关事件
- 提取最近一次可恢复的文件变更摘要

输出结构与现有 `UiTurnFileChanges` 对齐，但 `diff` 留空：

- `turnId`
- `files[]`
- `totalAdditions`
- `totalDeletions`
- `updatedAtIso`

### 2. fallback 的数据来源规则

优先支持以下来源：

1. `custom_tool_call` / `custom_tool_call_output`
   - `name === "apply_patch"`
   - 从 patch 文本中解析文件路径
2. `patch_apply_begin` / `patch_apply_end`
   - 若 session 中存在，优先使用结构化 patch 事件
3. 其他显式文件变更事件
   - 仅在已有稳定字段时接入，不做猜测性解析

解析策略：

- 仅提取文件路径与变更类型
- `additions/deletions` 能精确算则算，不能算时保守返回 `0`
- 对 `*** Add File` / `*** Update File` / `*** Delete File` / `*** Move to` 做最小支持

### 3. 前端加载链路调整

`loadMessages(threadId)` 的顺序改为：

1. 调 `thread/read`，保持现有消息和 `fileChanges` 加载逻辑
2. 如果 `thread/read.fileChanges` 为空：
   - 调用 fallback 接口
   - 若命中，则写入 `latestFileChangesByThreadId`
   - 再走现有 `saveLatestFileChangesMap()`

这样可以保证：

- 实时 diff 仍走原链路
- 刷新后若协议侧没提供 `fileChanges`，仍能恢复摘要卡片
- 本地持久化结构无需再次扩大

### 4. UI 约束保持不变

摘要 fallback 不改变当前交互边界：

- 文件变更卡片继续显示
- 若文件项 `diff === ''`，仍不可点开完整 diff
- 文件引用仍优先走文件预览，而不是空 diff 预览

这能避免“恢复了卡片，但点击后打开空补丁”的退化。

## 数据流

### 写入链路

1. 实时 `turn/diff/updated` 到达
2. 或前端刷新后命中 fallback 摘要
3. `latestFileChangesByThreadId` 更新
4. `saveLatestFileChangesMap()` 写入 summary-only 本地存储

### 刷新恢复链路

1. 页面初始化读取 `thread-file-changes.v2`
2. 用户进入线程时调用 `loadMessages`
3. 若 `thread/read` 没有 `fileChanges`
4. 再调用 fallback 接口补摘要
5. UI 恢复文件变更卡片

## 风险与约束

- session jsonl 结构并非严格稳定，解析必须做容错
- fallback 只能保证“最近一次可恢复摘要”，不保证历史所有 turn 全量恢复
- `additions/deletions` 可能无法从所有 patch 事件中精确还原，必要时允许降级为 `0`
- 解析应只读取目标线程的 session 文件，不做全局扫描

## 测试策略

### 服务端

- fixture jsonl 中包含 `custom_tool_call apply_patch`
- 能提取出：
  - `turnId`
  - 正确文件路径列表
  - 正确的文件数
- 无匹配事件时返回 `null`
- 非法或损坏 jsonl 时返回 `null`，不抛未处理异常

### 前端

- `thread/read.fileChanges === null` 时会请求 fallback 接口
- fallback 命中后会写入 `latestFileChangesByThreadId`
- fallback 结果会继续落入 `thread-file-changes.v2`
- 无 diff 摘要的文件项继续保持不可点

## 影响面

- 服务端：
  - `src/server/codexAppServerBridge.ts`
  - 新增 session fallback 解析模块
- 前端：
  - `src/api/codexRpcClient.ts` 或 `src/api/codexGateway.ts`
  - `src/composables/useDesktopState.ts`
- 测试：
  - 新增服务端 fallback 测试
  - 扩展 `tests/threadFileChangesPersistence.test.mjs`

## 验收标准

- 真实 `apply_patch` 型文件改动后，刷新线程仍能看到文件变更摘要卡片
- 浏览器本地仍只保存 summary-only 数据
- 无 diff 的摘要项不会打开空 diff
- `thread/read` 继续无 `fileChanges` 时，fallback 仍能兜底恢复摘要
