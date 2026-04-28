# Web 端审批浮层设计

## 背景

上一轮已经把 `execCommandApproval` / `applyPatchApproval` 的基础链路接回 Web 端，但现场验证显示仍有两个明显体验缺口：

- 提权审批不会像 Codex App 那样自动浮出，用户需要自己在消息流里找
- 刷新页面时审批短暂出现后又像“消失”了一样，看不到明确的审批选项

这说明当前问题已经从“请求进不来”转成了“请求虽然到了，但产品呈现还不稳定”。如果只继续修协议字段，而不补强视觉入口和兜底逻辑，用户仍然会认为 Web 端没有真正支持审批。

## 目标

- 当前线程出现待审批请求时，自动在 composer 上方弹出明显的审批浮层
- 浮层内容复用现有 `ApprovalRequestCard`，保持决策映射一致
- 即使审批模型构建失败，也不能渲染成空白；必须回退到通用 request 卡
- 保持消息流仍可滚动，审批记录仍存在于线程上下文中

## 非目标

- 不重做现有审批卡的文案和决策体系
- 不新增全局系统通知、声音提醒或浏览器通知
- 不把所有 request 类型都做成浮层，只处理审批类 request
- 不改动 app-server 协议或 `documentation/app-server-schemas/`

## 根因补充

### 1. 当前审批入口仍然不够显眼

现在审批卡仍然嵌在消息流内部。对长线程或移动端来说，哪怕请求已经正确挂到当前线程，用户也很容易错过它，体感上就会像“没有弹出来”。

### 2. 审批卡分支没有失败兜底

`ThreadConversation.vue` 目前只要 method 命中审批类型，就直接走 `ApprovalRequestCard` 分支。但 `ApprovalRequestCard` 自身使用 `v-if="model"`：

- 一旦 `buildApprovalRequestDisplayModel()` 因为运行时 payload 形态差异返回 `null`
- 页面不会显示审批卡
- 也不会回退到通用 request-card

最终用户看到的效果就是“闪一下就没了”或“什么都没有”。

### 3. 运行时 payload 可能存在形态差异

虽然 schema 文档里主要展示 `camelCase` 字段，但真实运行时仍然可能混入 `snake_case` 键名或局部字段缺失。审批展示层必须更宽容地解析：

- `proposedExecpolicyAmendment` / `proposed_execpolicy_amendment`
- `fileChanges` / `file_changes`
- `callId` / `call_id`
- `conversationId` / `conversation_id`

## 推荐方案

### 1. 新增“当前线程审批浮层”

在 `App.vue` 的 composer 区上方增加一个浮层承载位：

- 只在当前线程存在可展示的审批请求时出现
- 默认取当前线程最早收到、尚未处理的审批请求
- 浮层居中显示，宽度接近 Codex App 审批框
- 样式上明显高于 thinking indicator 和 composer，但不改成全屏锁定模态

这样能保留当前页面结构，又让审批自动进入用户视线。

### 2. 浮层与消息流复用同一审批卡

浮层本身不重新发明一套审批 UI，而是直接复用 `ApprovalRequestCard`：

- 提交
- 跳过
- 打开工作区 diff
- 决策映射

这样能保证消息流里的审批记录和浮层审批结果一致，不会出现两套分裂逻辑。

### 3. 浮层出现时隐藏同一请求的消息流副本

为避免一个请求同时在浮层和消息流里重复出现：

- `App.vue` 计算当前浮层对应的 `request.id`
- `ThreadConversation.vue` 收到该 id 后跳过对应的 inline 审批卡渲染
- 其他普通 request 仍按原样显示

### 4. 审批模型失败时强制回退到通用 request-card

在 `ThreadConversation.vue` 中增加显式判定：

- 只有“是审批类 request 且模型成功构建”时才走 `ApprovalRequestCard`
- 如果 method 是审批类但模型构建失败，则继续渲染通用 request-card

这样最差也会让用户看到一张可感知、可继续处理的请求卡，而不是空白。

### 5. 宽容解析运行时 payload

在 `approvalRequestDisplay.ts` 增加对常见 `snake_case` 形态的兼容读取，并对缺失字段使用安全占位：

- 命令审批优先从 `command` 数组或字符串读取
- 规则授权同时兼容 `proposedExecpolicyAmendment` / `proposed_execpolicy_amendment`
- 文件审批同时兼容 `fileChanges` / `file_changes`

## 方案对比

### 方案 A：只补 snake_case 兼容

优点：

- 改动最小

缺点：

- 解决不了“不会自动弹出来”的核心体验问题

### 方案 B：只做审批浮层

优点：

- 视觉提醒明显

缺点：

- 如果模型偶发失败，浮层也会跟着空白或不出现

### 方案 C：浮层 + 兜底 + 宽容解析

优点：

- 同时解决“看不见”“会消失”“不能操作”三类问题
- 与现有统一审批卡方向一致

缺点：

- 需要同时改 `App.vue`、`ThreadConversation.vue`、展示 helper 和测试

结论：采用方案 C。

## 实现落点

- `src/App.vue`
  - 计算当前线程主审批请求
  - 在 composer 上方渲染审批浮层
- `src/components/content/`
  - 新增 `PendingApprovalOverlay.vue`，复用 `ApprovalRequestCard`
- `src/components/content/ThreadConversation.vue`
  - 增加审批模型失败兜底
  - 跳过浮层对应请求的 inline 重复渲染
- `src/utils/approvalRequestDisplay.ts`
  - 增加 `snake_case` 兼容读取
  - 暴露审批 method 判定 helper
- `tests/`
  - 覆盖审批浮层显隐
  - 覆盖审批失败时回退到 request-card
  - 覆盖 `snake_case` payload 兼容

## 测试策略

- helper 测试：`snake_case` 提权审批 payload 也能构造展示模型
- UI 接线测试：`App.vue` 会在 composer 上方渲染审批浮层
- UI 接线测试：`ThreadConversation.vue` 会跳过浮层对应请求的重复 inline 卡片
- 回退测试：审批模型为空时仍显示通用 request-card
- 回归验证：现有审批测试与 `npm run build`
