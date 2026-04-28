# Message Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为会话中的用户消息和 assistant 连续消息组增加复制能力，避免一轮 assistant 回复被拆成多次复制。

**Architecture:** 保留现有 `UiMessage[]` 数据结构，在会话渲染层额外计算 assistant 连续消息组边界，只让组尾消息展示一个复制按钮。复制文本拼接与 Clipboard API / 降级逻辑放进 util，测试分成三层：复制 util、assistant 分组 helper、`ThreadConversation.vue` 接线。

**Tech Stack:** Vue 3、TypeScript、Node `node:test`、Clipboard API、Tailwind + scoped CSS

---

### Task 1: 补充复制实现计划与范围约束

**Files:**
- Modify: `docs/plans/2026-04-03-message-copy-design.md`
- Create: `docs/plans/2026-04-03-message-copy-implementation-plan.md`

**Step 1: 固定第一版复制语义**

- `user`：单条复制 `message.text`
- `assistant`：连续消息组合并复制
- `system` / `worked`：不提供复制入口
- assistant 组内文本过滤空字符串后用双换行拼接

**Step 2: 固定交互边界**

- 桌面端 hover / focus-within 显示
- 移动端弱常显
- 成功态 1.2 到 1.5 秒自动恢复

### Task 2: 先写 assistant 分组与复制 util 的失败测试

**Files:**
- Create: `tests/messageCopy.test.mjs`
- Create: `src/utils/messageCopy.ts`

**Step 1: 为 assistant 分组拼接写测试**

- 连续 assistant 消息只在组尾显示复制入口
- 拼接内容保持视觉顺序
- `user` / `system` / `worked` 会打断分组

**Step 2: 为 Clipboard API 成功路径写测试**

- 调用 `navigator.clipboard.writeText`
- 传入值必须等于消息原始 `text`

**Step 3: 为降级路径写测试**

- Clipboard API 缺失或抛错时
- 自动回退到隐藏 `textarea + execCommand('copy')`
- 成功后清理临时 DOM 节点

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/messageCopy.test.mjs`
Expected: FAIL，提示缺少复制 util 导出或行为不匹配

### Task 3: 实现 assistant 组 helper 与复制 util

**Files:**
- Create: `src/utils/messageCopy.ts`
- Test: `tests/messageCopy.test.mjs`

**Step 1: 实现 assistant 组 helper**

- 输入：`UiMessage[]` 与当前索引
- 输出：
  - 当前消息是否应显示复制按钮
  - 当前组的复制文本
  - 当前组的稳定 key

**Step 2: 实现主复制函数**

- 输入：字符串文本
- 优先 `navigator.clipboard.writeText`
- 失败时进入降级逻辑

**Step 3: 实现降级逻辑**

- 创建隐藏 `textarea`
- 选中文本并执行 `document.execCommand('copy')`
- 无论成功失败都清理节点

**Step 4: 重新运行 util 测试**

Run: `node --test tests/messageCopy.test.mjs`
Expected: PASS

### Task 4: 接入会话消息 UI

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Create: `src/components/icons/IconTablerCopy.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 给普通消息增加复制按钮**

- 用户消息仍按单条显示按钮，且按钮悬挂在气泡左下外侧
- assistant 只在组尾消息的 `.message-card` 左下角动作区显示按钮
- worked 分隔消息不接入

**Step 2: 增加复制状态与反馈**

- 使用 `copiedMessageKey`
- 点击后切为“已复制”
- 定时恢复默认状态
- 组件卸载时清理 timer

**Step 3: 补主题与移动端样式**

- 按钮颜色走现有语义 token
- 用户消息和 assistant/system 消息都不压正文
- 手机端提高可见性与点击热区

**Step 4: 增加中英文文案**

- `复制`
- `已复制`
- `复制消息`

### Task 5: 增加组件接线回归测试

**Files:**
- Modify: `tests/messageCopy.test.mjs`
- Test: `src/components/content/ThreadConversation.vue`
- Test: `src/i18n/uiText.ts`

**Step 1: 断言组件已接入复制入口**

- `ThreadConversation.vue` 存在复制按钮类名
- 使用复制 util
- 使用 assistant 分组 helper
- 使用新增文案 key

**Step 2: 断言文案已定义**

- `threadConversation.copy`
- `threadConversation.copied`
- `threadConversation.copyMessage`

### Task 6: 验证与回填结果

**Files:**
- Modify: `docs/plans/2026-04-03-message-copy-implementation-plan.md`

**Step 1: 运行针对性测试**

Run: `node --test tests/messageCopy.test.mjs`
Expected: PASS

**Step 2: 运行全量现有测试**

Run: `node --test tests/*.mjs`
Expected: PASS

**Step 3: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 4: 回填执行结果**

- 记录实际实现文件
- 记录验证命令与结果
- 标注是否还有“复制纯文本 / 复制其他卡片”待办

### 风险与回滚

- 风险：移动端 Safari 下 Clipboard API 可能不稳定，因此必须保留降级路径。
- 风险：复制按钮如果始终常显，可能对用户消息气泡形成视觉噪音，所以手机端只做弱常显。
- 风险：assistant 分组规则如果定义不准，可能出现漏复制或把不该拼接的消息拼到一起。
- 回滚：移除 `ThreadConversation.vue` 内复制按钮与状态，删除 `messageCopy.ts` 和新增 icon / 文案即可恢复。

### 验收与验证命令

- 普通消息都能单独复制其原始 Markdown。
- 复制成功后有短暂成功反馈。
- 深色 / 浅色模式下按钮可读且不喧宾夺主。
- `node --test tests/messageCopy.test.mjs` 通过。
- `node --test tests/*.mjs` 通过。
- `npm run build` 通过。

## 执行结果

### 实际完成项

- 已保留用户消息单条复制。
- 已在 `src/utils/messageCopy.ts` 增加 assistant 连续消息组边界判断与复制文本拼接 helper。
- 已在 `src/components/content/ThreadConversation.vue` 改成用户消息按钮外悬、assistant 只在组尾消息显示一个复制按钮，并使用组合并后的复制文本。
- 已补充并通过 assistant 组复制回归测试。

### 实际偏差

- 当前仍未增加复制失败 toast 或错误提示，失败时只静默返回。
- 当前成功反馈采用图标切换，没有额外显示“已复制”文字标签。

### 验证结果

- 2026-04-03：assistant 组复制已通过 `node --test tests/messageCopy.test.mjs`。
- 2026-04-03：assistant 组复制已通过 `node --test tests/*.mjs`。
- 2026-04-03：assistant 组复制已通过 `npm run build`。

### 后续待办

- 视真实使用反馈决定是否补“复制失败提示”。
- 后续可扩展“复制纯文本”和审批卡片 / 文件变更卡片复制。
