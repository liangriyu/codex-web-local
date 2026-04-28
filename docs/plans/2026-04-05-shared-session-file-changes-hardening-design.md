# Shared Session 与文件变更链路收敛设计

## 背景

当前分支已经补上“刷新后恢复文件变更卡片”的基础能力，但代码审查暴露出三个高风险点：

- 文件变更恢复依赖浏览器 `localStorage` 持久化完整 `diff`，容量和异常边界过于脆弱。
- shared session 把所有待人工介入请求都映射成 `approval` 语义，前后端字段和 UI 文案存在系统性误导。
- 文件变更调试日志默认开启，诊断代码已经越过开发边界。

这些问题都不是单纯的 UI 瑕疵，而是会直接影响刷新恢复、共享会话状态判断和生产可观测边界。

## 目标

- 保留“刷新后恢复文件变更卡片”的体验，但不再把完整代码 `diff` 长期写入浏览器本地存储。
- 明确区分“真实审批请求”和“其他需要人工关注的请求”，消除 shared session 中 `approval` 语义漂移。
- 保留问题排查能力，但把调试日志降为开发态或显式开关能力。

## 非目标

- 不重做 shared session 的整体架构或事件流。
- 不引入新的后端存储系统。
- 不重做文件 diff 展示组件本身的交互。
- 不在本轮解决所有 shared session UI 文案历史债，只修复当前最容易误导的链路。

## 问题拆解

### 1. 文件变更持久化边界过大

当前实现将 `UiTurnFileChanges` 直接序列化到 `localStorage`。这意味着：

- 大 patch 会快速接近浏览器配额上限。
- Safari 隐私模式或受限环境下，`setItem` 可能同步抛错。
- 完整代码 diff 被浏览器长期持久化，超出“刷新恢复摘要信息”的真实需求。

实际需求并不是“离线保留完整补丁”，而是“刷新后仍能知道这个 turn 产生了哪些文件变化，并保留最基本的摘要卡片”。

### 2. shared session 审批语义漂移

当前 projector 会把所有带 `method` 的 pending request 计入 `pendingApprovalCount`，未知方法统一落到 `other`，再一起映射到 `needs_attention`。结果是：

- 真实审批请求与其他人工处理请求被混成一类。
- UI 却继续使用“待审批 / 待授权 / approval pending”文案。
- 测试也把这种混淆行为固化下来。

这会让用户误判当前线程是否真的存在可审批动作。

### 3. 调试日志越界

文件变更持久化链路为了排查问题加入了调试日志，但当前开关是硬编码开启状态。这样会在生产环境持续打印：

- threadId
- turnId
- 存储读写行为

这类日志应当是临时诊断能力，而不是常驻产线行为。

## 方案对比

### 方案 A：最小热修

- 为 `localStorage` 加 `try/catch`
- 关闭默认日志
- 保持 approval 语义不变

优点：

- 成本最低
- 回归范围小

缺点：

- 仍然持久化完整 diff
- shared session 的语义错误继续保留

### 方案 B：边界收敛

- 本地只持久化文件变更摘要，不保存完整 diff
- shared session 拆分 approval 与 attention 语义
- 日志改成开发态/显式开关

优点：

- 直接处理当前三个高风险问题
- 不需要重写架构

缺点：

- 需要同步修改前端状态、projector 逻辑、文案与测试

### 方案 C：完整重构

- 把 shared session 与 diff 恢复都改成新的事件快照体系

优点：

- 模型最干净

缺点：

- 明显超出当前分支范围
- 实施和回归成本过高

结论：本轮采用方案 B。

## 推荐方案

### 1. 文件变更持久化改为“摘要快照”

新增面向本地存储的轻量结构，例如：

- `threadId`
- `turnId`
- `updatedAt`
- `files[]`
- 每个文件的 `path / added / deleted`
- 聚合统计 `totalAdded / totalDeleted`

刷新恢复时：

- 优先从该摘要结构恢复“变更文件卡片”
- 仅保证摘要可恢复，不承诺完整 diff 一定可离线恢复

点击“完整 Diff”时有两种处理策略：

- 推荐：按 `threadId + turnId` 重新请求 diff 数据
- 兜底：若协议侧拿不到 diff，则保持摘要卡片可见，但完整 diff 按不可恢复处理

### 2. 本地存储增加显式安全边界

在摘要快照基础上，补齐以下约束：

- 所有 `load/save/remove` 都包 `try/catch`
- 使用独立版本号，避免老结构污染新逻辑
- 限制最大线程数量，例如只保留最近 20 个线程
- 超限时按 `updatedAt` 淘汰最旧记录

这样即便存储失败，也不会影响线程消息本身的加载。

### 3. shared session 拆分 approval 与 attention

服务端 projector 与前端消费侧都需要统一语义：

- `pendingApprovalCount`
  - 只统计真实审批类请求
- `pendingAttentionCount`
  - 统计其他需要人工处理但不是审批的请求
- `pendingApprovalKinds`
  - 只保留审批类型枚举
- 如有需要，可新增 `pendingAttentionKinds`

状态映射规则调整为：

- 有真实审批时，显示“待审批”
- 没有审批但有 attention 时，显示“待处理请求”或“需要关注”
- 只有 persisted 遗留记录时，继续沿用此前已设计的“遗留记录”语义，不混入 live approval

### 4. UI 文案与状态卡同步收口

需要同步修改：

- `SharedSessionStatusCard`
- 侧栏 shared session 概览
- 相关 i18n 文案

收口原则：

- approval 文案只用于可审批事项
- attention 文案用于其他需要人工介入的事项
- persisted record 文案继续单独表达“遗留记录，需要重新触发”

### 5. 调试能力改为显式开关

日志策略调整为：

- 开发态默认可开
- 生产态默认关闭
- 可通过 `localStorage` flag 或 URL 参数显式开启

日志内容也做降敏：

- 打印事件名、命中情况、记录数量
- threadId / turnId 只保留短前缀
- 不打印完整 diff 或文件内容

## 数据流调整

### 文件变更恢复链路

1. `turn/diff` 到达
2. 内存态继续保留完整 `UiTurnFileChanges`
3. 持久化层只提取摘要快照并尝试写入本地
4. 刷新后优先恢复摘要卡片
5. 需要完整 diff 时再走运行时补拉或兜底降级

### shared session 状态链路

1. server request 进入 projector
2. projector 先判断是否属于真实审批
3. 分别累计 approval 与 attention
4. snapshot 明确输出两类计数
5. UI 根据语义选择对应文案和视觉状态

## 影响面

- `src/composables/desktop-state/storage.ts`
  - 本地存储结构、版本、异常处理、日志开关
- `src/composables/useDesktopState.ts`
  - 文件变更摘要提取、恢复与调试链路
- `src/server/sharedSessionProjector.ts`
  - approval/attention 分类逻辑
- `src/server/sharedSessionSnapshot.ts`
  - snapshot 字段定义
- `src/components/content/SharedSessionStatusCard.vue`
  - shared session 状态表达
- `src/components/sidebar/SidebarThreadTree.vue`
  - 概览文案与标记
- `src/i18n/uiText.ts`
  - approval/attention/persisted 三类文案
- 相关测试：
  - `tests/threadFileChangesPersistence.test.mjs`
  - `tests/sharedSessionProjector.test.mjs`
  - `tests/sharedSessionStatusCard.test.mjs`
  - `tests/sidebarSharedSessionOverview.test.mjs`

## 风险与兼容性

### 风险 1：刷新后不再离线恢复完整 diff

这是有意取舍。当前用户真正需要的是“知道改了哪些文件”，不是在本地永久缓存完整补丁。若必须保留完整 diff，应该走受控后端恢复能力，而不是浏览器本地无限堆积。

### 风险 2：snapshot 字段变更会牵动现有 UI

因此建议采用增量兼容方式：

- 先新增 `pendingAttentionCount`
- 再逐步把旧 UI 改到新字段
- 最后视情况废弃混用的 approval 计数

### 风险 3：诊断信息减少后排查门槛上升

通过显式 debug flag 兜底，而不是默认常驻日志。

## 验收标准

- 刷新后仍可恢复文件变更摘要卡片
- 大 diff 或本地存储失败时，页面不因异常中断
- shared session 中只有真实审批会显示“待审批/待授权”
- 非审批类人工请求显示为“待处理请求/需要关注”
- 生产环境默认不输出文件变更调试日志
- `npm run build` 与相关测试通过
