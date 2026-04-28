# Web 端提权审批展示修复设计

## 背景

当前 Web 端在发送需要提权审批的指令时，会停留在“AI 思考中”，但不会像 Codex App 那样展示“是否运行此命令”或“是否允许应用补丁”的审批卡。用户无法继续交互，只能看到线程像卡死了一样。

现有排查结果表明，这不是单点 UI 样式问题，而是“协议归属 + 展示接线 + 状态提示”三段链路都存在缺口：

- `execCommandApproval` / `applyPatchApproval` 这两类 server request 的参数带的是 `conversationId`
- bridge 与前端归一化逻辑目前主要只认 `threadId`
- 统一审批卡目前只覆盖 `item/commandExecution/requestApproval` 与 `item/fileChange/requestApproval`
- “AI 思考中” 提示没有在待审批场景下主动让位

因此修复目标不是增加一个额外提示，而是把提权审批接回现有审批链路，让它和普通审批一样归属到当前线程、出现在消息流里、并取代误导性的思考状态。

## 目标

- 让 `execCommandApproval` 和 `applyPatchApproval` 能正确归属到当前线程
- 让这两类审批在 Web 端复用现有统一审批卡，而不是落到通用调试请求卡
- 当当前线程已有待审批请求时，不再继续强调“AI 思考中”
- 保持现有命令审批、文件改动审批、共享快照和持久化审批账本行为不回退

## 非目标

- 不改动 `documentation/app-server-schemas/` 生成产物
- 不重做整套审批视觉语言
- 不把审批改成全局模态
- 不在这一轮重构所有 `server/request` 类型

## 根因

### 1. 提权审批没有稳定挂到线程

`execCommandApproval` 和 `applyPatchApproval` 使用 `conversationId` 标识线程，但 bridge 的 `readPendingServerRequestThreadId()` 当前只读取 `threadId`，导致这两类请求进入 pending ledger 时很容易丢失线程归属。

这会进一步影响：

- 前端 `pendingServerRequestsByThreadId` 无法把请求挂到当前线程
- 共享会话快照无法把它识别成当前线程 attention
- 当前会话消息区不会渲染相应审批卡

### 2. 审批展示层只覆盖旧的两类 method

`ApprovalRequestCard` 虽然已经产品化，但 `buildApprovalRequestDisplayModel()` 和 `ThreadConversation.vue` 目前只特判：

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`

因此即使提权审批请求进入了线程，也仍然只会走通用 request-card 回退逻辑，无法表现成明确的“授权”交互。

### 3. 思考态没有为审批态让位

`App.vue` 的 thinking indicator 目前只看：

- 线程进行中
- 正在发送消息
- live overlay 是否存在

它没有把“当前线程已进入待审批状态”视为更高优先级的 UI 状态，所以用户会同时看到“实际上正在等审批”和“表面上仍在思考”之间的冲突。

## 推荐方案

采用“最小闭环修复”：

### 1. 统一线程归属解析

在 bridge 和前端通知归一化里，让 pending request 的线程归属优先按以下顺序读取：

- `threadId`
- `thread_id`
- `conversationId`
- `conversation_id`

这样不改协议也能兼容已有 request 形态，让 `execCommandApproval` / `applyPatchApproval` 和现有审批一起进入当前线程。

### 2. 扩展统一审批卡支持新的两类审批

把 `execCommandApproval` 视作“命令授权”的另一种协议入口，把 `applyPatchApproval` 视作“文件改动授权”的另一种协议入口。

展示层做法：

- `execCommandApproval`
  - 标题仍用“是否允许执行此命令？”
  - 命令内容由 `command: string[]` 拼接为可读 shell 文本
  - 第二选项继续支持“会话内减少重复确认”或“规则授权”
- `applyPatchApproval`
  - 标题仍用“是否允许应用这些文件改动？”
  - 原因、授权根目录取自 request params
  - 文件列表优先从 request 自带 `fileChanges` 推导；若现有 diff 快照可复用，则继续展示摘要

响应层做法：

- 对旧类型继续返回现有 decision 结构
- 对 `execCommandApproval` / `applyPatchApproval` 映射到协议要求的 `ReviewDecision`
  - `approved`
  - `approved_for_session`
  - `approved_execpolicy_amendment`
  - `denied`
  - `abort`

### 3. 待审批时压掉“AI 思考中”

当选中线程存在 `pendingRequests.length > 0` 时：

- 消息区继续显示审批卡
- 底部/浮层的 thinking indicator 不再显示

这样页面会明确表现为“等待你确认”，而不是“模型还在思考”。

## 方案对比

### 方案 A：只改 thinking indicator

优点：

- 改动最小

缺点：

- 仍然看不到审批入口
- 只能把“卡死”改成“安静卡死”

### 方案 B：只修线程归属

优点：

- 可以让请求进入当前线程

缺点：

- 新类型仍会走通用 request-card
- 体验仍然不像可操作的审批流程

### 方案 C：最小闭环修复

优点：

- 一次打通归属、渲染、交互和状态提示
- 保持现有统一审批卡方向，不额外分叉组件
- 与 Codex App 的核心体验更接近

缺点：

- 需要同时改 bridge、状态层、展示 helper、会话组件和测试

结论：采用方案 C。

## 实现落点

- `src/server/codexAppServerBridge.ts`
  - 修正 pending request 的线程归属提取逻辑
- `src/composables/desktop-state/notification-parsers.ts`
  - 修正 `normalizeServerRequest()` 的线程归属回退逻辑
- `src/utils/approvalRequestDisplay.ts`
  - 支持 `execCommandApproval` 与 `applyPatchApproval`
  - 增加这两类协议到统一展示模型和 decision 映射
- `src/components/content/ThreadConversation.vue`
  - 让新旧四类审批都走 `ApprovalRequestCard`
- `src/App.vue`
  - 当前线程有待审批时隐藏 thinking indicator
- `tests/`
  - 增加 bridge、display、conversation、thinking indicator 相关失败测试与回归测试

## 测试策略

- bridge 测试：`conversationId` 请求应归属到正确线程
- display helper 测试：新旧四类审批都能构造出统一展示模型
- UI 接线测试：`ThreadConversation.vue` 对新 method 走审批卡分支
- 状态测试：有 pending approval 时不显示 “AI 思考中”
- 回归验证：相关现有审批测试与 `npm run build`
