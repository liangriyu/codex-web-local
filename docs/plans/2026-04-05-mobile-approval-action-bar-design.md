# 移动端审批操作栏样式设计

## 背景

当前 Web 端审批浮层在桌面端已经具备完整的审批选项与提交按钮，但手机端仍存在明显可用性问题：

- 审批卡内容较长时，底部操作区会被移动浏览器工具栏挤出可视区域
- `跳过 / 提交` 按钮跟随正文自然流向下滚动，用户需要继续下拉才能找到
- iPhone / 移动浏览器底部安全区没有额外留白，按钮更容易被遮挡

这会直接破坏提权审批的完成链路。相比桌面端的轻微布局问题，手机端这里已经是阻断级体验缺陷。

## 目标

- 手机端审批卡始终能看到 `提交` 按钮
- 长内容仍可查看，但底部操作区保持稳定、易触达
- 保持桌面端现有视觉结构基本不变
- 不改审批协议、选项文案和决策映射

## 非目标

- 不改动 `ApprovalRequestDisplayModel` 数据结构
- 不新增全屏模态或独立路由页
- 不重做桌面端审批卡整体风格
- 不修改 bridge、snapshot 或 server request 协议

## 根因

### 1. 操作区不是 sticky

`ApprovalRequestCard.vue` 的 `approval-actions` 目前只是普通 footer，手机端内容一长就会被挤到视口外。

### 2. 缺少 safe-area 处理

移动浏览器底栏会侵占实际可点击空间，但当前审批卡没有使用 `env(safe-area-inset-bottom)` 给底部按钮额外留白。

### 3. 移动端内容密度仍偏桌面

命令块、元信息和选项卡都沿用桌面端节奏，在小屏幕上会快速推高卡片总高度。

## 方案对比

### 方案 A：仅压缩间距

优点：

- 改动最小

缺点：

- 只能“更容易看到按钮”，不能保证始终可见

### 方案 B：移动端 sticky 操作栏

优点：

- `提交` 始终可见
- 对长审批内容最稳

缺点：

- 需要在卡片底部增加背景和边界，避免与正文混在一起

### 方案 C：改成全屏模态底部抽屉

优点：

- 交互最强提醒

缺点：

- 范围过大，容易影响现有桌面/消息流结构

结论：采用方案 B。

## 推荐设计

### 1. 移动端操作栏改为 sticky 底栏

在窄屏下让 `approval-actions`：

- `position: sticky`
- 贴住卡片底部
- 带半透明/实色背景与轻微上边界
- 底部补 `safe-area-inset-bottom`

这样正文继续滚动，操作栏保持在审批卡底部可见。

### 2. 操作按钮改成稳定双列

手机端把 `跳过` 和 `提交` 改成两列等宽：

- 触达面积更稳定
- 不依赖右对齐余量
- 不会因为文案或浏览器缩放导致主按钮跑出视口

### 3. 收紧移动端垂直节奏

仅在手机端小幅压缩：

- 卡片 padding
- 面板间距
- 选项区与底栏间距

避免 sticky 底栏挤压正文可视面积过多。

## 实现落点

- `src/components/content/ApprovalRequestCard.vue`
  - 增加移动端 sticky 底栏
  - 增加 `safe-area-inset-bottom`
  - 调整按钮布局与窄屏间距
- `src/components/content/PendingApprovalOverlay.vue`
  - 必要时补充移动端宽度/底部留白，确保浮层不被外层裁切
- `tests/approvalRequestUi.test.mjs`
  - 补充移动端 sticky/safe-area 样式约束测试
- `tests/pendingApprovalOverlay.test.mjs`
  - 补充浮层在移动端承载审批卡的样式约束测试

## 测试策略

- 先写失败测试，锁定 `sticky`、`safe-area-inset-bottom`、移动端双按钮布局
- 再做最小实现
- 回归现有审批 UI 测试
- 执行 `npm run build`
