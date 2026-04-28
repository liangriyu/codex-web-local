# 会话消息复制能力设计

## 背景

当前会话消息区没有统一的复制入口。用户如果想复用 assistant 输出、用户输入或 system 消息，只能依赖浏览器原生选中复制，移动端和长消息场景下体验都不稳定。

从现有界面结构看，普通消息统一由 `src/components/content/ThreadConversation.vue` 渲染，消息源内容是 `message.text`。但当前前端会把一个 turn 中的多个 item 展开成多条 `UiMessage`，这意味着“用户理解成一轮 assistant 回复”的内容，在数据层未必只有一条消息。

## 目标

- 为用户理解上的“单条消息 / 单轮 assistant 回复”增加复制能力
- 第一版覆盖：
  - 用户消息：单条复制
  - assistant 连续消息组：合并复制
- 第一版不对 system / worked 消息提供复制入口
- 第一版复制语义为：复制原始 Markdown 文本，assistant 组内按视觉顺序拼接
- 保持移动端和桌面端都可用
- 不影响现有消息排版、链接跳转和图片预览交互

## 非目标

- 不处理审批卡片、文件变更卡片、worked 分隔消息
- 不做“复制纯文本 / 复制 Markdown”双模式切换
- 不实现富文本复制
- 不改消息数据结构
- 不在第一版把 turn 归一化逻辑整体改成“服务端先合并再返回”

## 推荐方案

### 1. 交互位置

在每条可复制消息块上增加一个轻量复制按钮：

- 用户消息：按钮悬挂在消息气泡左下外侧
- assistant 消息组：按钮保留在组尾消息卡片左下的底部动作区

交互规则：

- 桌面端：
  - 默认隐藏
  - hover 或 focus-within 时显示
- 移动端：
  - 按钮弱常显，避免依赖 hover
  - 保证点击热区不小于 32px

其中 assistant 采用“连续消息组只显示一个复制按钮”：

- 一组由连续相邻的 assistant 消息组成
- `worked`、`system`、`user`、审批卡片、文件变更卡片都会打断分组
- 复制按钮只显示在该组最后一条 assistant 消息的底部动作区

这样既保留了复制入口的可发现性，也更符合用户对“一轮回复”的理解。

### 2. 复制内容

第一版直接复制原始 Markdown：

- 用户消息：复制该条 `message.text`
- assistant 组：把组内消息的 `message.text` 依视觉顺序拼接
- 拼接规则为：过滤空文本后，用双换行连接

原因：

- 实现稳定，和模型原始输出一致
- 不需要从渲染后的 DOM 逆向还原格式
- 能完整保留标题、列表、代码块、链接等结构
- 对技术用户更友好，适合直接粘到 Markdown 编辑器或 issue / PR 评论中
- assistant 连续消息能一次复制，避免用户反复点多次

### 3. 反馈机制

点击复制后，按钮进入短暂成功态：

- 图标切换为“已复制”状态
- 持续 1.2 到 1.5 秒
- 然后恢复默认图标

状态控制建议：

- 使用一个 `copiedMessageKey: string | null`
- 每次复制覆盖上一次状态
- 通过 `setTimeout` 自动回退
- assistant 组可以用最后一条消息 id 作为组的 key

### 4. 复制实现策略

优先使用：

- `navigator.clipboard.writeText(copyText)`

失败时降级到隐藏 `textarea + document.execCommand('copy')`

原因：

- 移动端浏览器对 Clipboard API 支持不完全稳定
- 降级方案能减少 Safari / WebView 环境下的失败率

### 5. 视觉与主题

复制按钮应纳入现有主题 token 体系：

- 默认背景：`var(--color-bg-elevated)` 或 `var(--color-bg-overlay)`
- 默认文字：`var(--color-text-secondary)`
- hover：`var(--color-text-primary)` + `var(--color-bg-subtle)`
- 边框：`var(--color-border-default)`

不同消息角色的要求：

- 用户消息中按钮不进入气泡内部，避免破坏气泡完整性
- assistant 消息组的按钮不能重复出现
- 深色模式下按钮要清晰可见，但不抢阅读焦点

## 备选方案对比

### 方案 A：assistant 连续消息组复制

优点：

- 更贴近“复制这一轮回复”的用户心智
- 不需要整体改动消息数据结构
- 对现有布局侵入小

缺点：

- 需要定义 assistant 分组边界
- 需要让按钮只出现在组尾消息上

### 方案 B：继续按单条 `UiMessage` 复制

优点：

- 实现最简单
- 数据模型最直接

缺点：

- 一轮回复常常要复制多次
- 用户心智和数据粒度不一致

### 方案 C：按 turn 级别复制

优点：

- 语义最完整，一次即可复制整轮输出

缺点：

- 需要把 turn 和渲染消息重新映射
- 会把 system/worked 等辅助消息是否并入复制变成更复杂的规则问题

结论：第一版采用方案 A。

## 落点文件

- `src/components/content/ThreadConversation.vue`
  - 增加 assistant 组尾消息判断
  - 增加底部动作区内的复制按钮
  - 增加复制状态与复制逻辑
  - 增加对应样式
- `src/utils/`
  - 增加或扩展 assistant 组复制文本拼接 helper
- `src/components/icons/`
  - 新增复制图标组件，或引入一个极简 clipboard 图标
- `tests/`
  - 新增消息复制相关回归测试

## 测试建议

### 自动化

- assistant 连续消息组边界判断正确
- assistant 组复制内容按顺序正确拼接
- 复制成功后 `copiedMessageKey` 正确切换
- 定时器结束后恢复默认状态

### 手工验证

- 桌面端 hover assistant 组尾消息可见底部复制按钮
- 同一轮 assistant 连续输出只出现一个复制按钮
- 用户消息仍可单独复制
- 深色 / 浅色 / auto 三种主题可见性正常
- 手机端点击复制可成功
- 代码块、列表、链接等 Markdown 内容复制后结构保留

## 第二阶段可扩展项

- 给审批卡片、文件变更卡片增加复制
- 增加“复制纯文本”
- 增加“复制 Markdown / 复制纯文本”二选一菜单
- 针对代码块提供局部复制按钮

## 结论

第一版最合适的落地方式是：

- 用户消息保持单条复制
- assistant 改成连续消息组合并复制
- 复制原始 Markdown
- 用户消息按钮外悬，assistant 组尾按钮内置在底部动作区
- 桌面端 hover 显示，移动端弱常显
- 成功后给出短暂“已复制”反馈

这套方案改动范围小、实现稳定，并且和当前消息组件结构最匹配。
