# Theme Contrast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复手机端深色模式下文字、标签和代码块对比度不足的问题，并让浅色/深色/自动主题切换都走统一的语义色方案。

**Architecture:** 先在全局样式层建立一组最小语义色 token，由 `html[data-theme='light'|'dark']` 统一驱动，再把消息区、输入区、代码预览区这些高频阅读区域改成消费 token，而不是直接写死 `zinc/slate` 颜色。实现阶段优先保证深色模式的文字可读性和切换一致性，不扩散到不相关组件。

**Tech Stack:** Vue 3、Tailwind CSS 4、全局 CSS 变量、Node 内置 `node:test`、`npm run build`

---

## 背景与范围

- 当前主题切换机制已经存在于 `src/App.vue` 与 `src/style.css`，但深色模式主要依赖局部覆盖。
- 多个高频组件仍然直接使用 `text-zinc-*`、`bg-white`、`bg-zinc-50`、`border-zinc-200` 等浅色语义，导致手机端深色背景下的次级文字、标签、inline code、popover 和 diff 元信息对比度不足。
- 本次只处理高频阅读路径，不修改运行命令、协议或目录结构。

## 非目标

- 不重做整站视觉语言。
- 不一次性迁移全部 sidebar / menu / settings 组件。
- 不引入新的主题状态管理机制。

## 分步执行清单

### Task 1: 建立全局主题语义色 token

**Files:**
- Modify: `src/style.css`
- Verify: `npm run build`

**Step 1: 定义最小语义色集合**

- 在 `:root` 中新增浅色 token：
  - `--color-bg-app`
  - `--color-bg-surface`
  - `--color-bg-elevated`
  - `--color-text-primary`
  - `--color-text-secondary`
  - `--color-text-muted`
  - `--color-border-default`
  - `--color-code-bg`
  - `--color-code-text`
  - `--color-chip-bg`
  - `--color-chip-text`
  - `--color-link`
  - `--color-link-hover`

**Step 2: 在 `html[data-theme='dark']` 下定义对应深色 token**

- 深色 token 目标：
  - 正文更亮
  - 次级文字明显高于当前 `zinc-500` 可读性
  - 小型 badge / code 背景与文字至少拉开一档

**Step 3: 把全局容器改成消费 token**

- `body`
- `.desktop-layout`
- `.desktop-sidebar`
- `.desktop-main`
- `.content-root`
- `.content-code-preview`
- `.thread-composer-shell`
- `.file-change-card`

**Step 4: 保留并校正 `color-scheme`**

- 浅色为 `light`
- 深色为 `dark`
- 不新增新的主题切换状态

### Task 2: 修复消息区在深浅模式下的可读性

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Verify: `npm run build`

**Step 1: 替换正文与次级文本颜色**

- `message-text`
- `message-list`
- `worked-separator-text`
- `message-strong-text`

**Step 2: 替换代码相关样式**

- `message-inline-code`
- `message-code-block`
- `message-code-body`
- `message-file-link`

**Step 3: 修正用户消息卡片与图片弹窗**

- `message-card[data-role='user']`
- 深色下用户消息卡片内文字与 inline code
- `image-modal-close`
- `image-modal-image`

**Step 4: 深色模式去掉局部补丁式覆盖，改成 token 驱动**

- 保留必要的角色差异
- 不再依赖“正文一个颜色、暗黑补丁再覆盖一层”的写法

### Task 3: 修复输入区和状态浮层在手机端深色模式下的对比度

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Verify: `npm run build`

**Step 1: 调整小字号和弱对比元素**

- `thread-composer-branch-text`
- `thread-composer-branch-chevron`
- `thread-composer-context-ring`
- `thread-composer-context-ring-inner`

**Step 2: 调整 popover、badge、按钮**

- `thread-composer-status-popover`
- `thread-composer-popover-title`
- `thread-composer-popover-line`
- `thread-composer-popover-row-*`
- `thread-composer-popover-hint`
- `thread-composer-compact-button`

**Step 3: 统一输入和分支操作控件颜色**

- `thread-composer-branch-input`
- `thread-composer-branch-create-button`
- 提交 / 停止按钮的 disabled 与 hover 状态

**Step 4: 移动端深色模式兜底**

- 若 token 调整后仍有弱对比元素，再补一层移动端最小保护
- 优先通过 token 解决，不优先加大量 `@media` 补丁

### Task 4: 修复代码预览面板与 diff 元信息的对比度

**Files:**
- Modify: `src/components/content/CodePreviewPanel.vue`
- Verify: `npm run build`

**Step 1: 调整模式切换和 meta 区域**

- `workspace-diff-mode-tab`
- `workspace-diff-mode-meta`
- `workspace-diff-mode-description`
- `workspace-diff-mode-refs`
- `workspace-diff-base-branch-*`

**Step 2: 调整空态、warning、status panel**

- `workspace-diff-warning`
- `workspace-diff-empty`
- `workspace-status-*`

**Step 3: 调整 diff 列表与代码行区域**

- `workspace-diff-item-button`
- `workspace-diff-item-path`
- `workspace-diff-item-body`
- `diff-ln-old`
- `diff-ln-new`
- `diff-line-text`

**Step 4: 保持新增/删除色可读**

- `file-change-stats-add`
- `file-change-stats-del`
- diff 行的加减底色在深色模式下不能糊成一片

### Task 5: 增加主题对比度回归检查并完成验证

**Files:**
- Create: `tests/theme-contrast-tokens.test.mjs`
- Verify:
  - `node --test tests/*.mjs`
  - `npm run build`

**Step 1: 为主题 token 建一个最小回归测试**

- 测试目标：
  - 深色/浅色 token 关键变量存在
  - 深色 token 不回退到浅色语义值
  - 关键变量名不会在后续重构中丢失

**Step 2: 手工验证**

- 桌面浏览器：
  - `light`
  - `dark`
  - `auto`
- 手机浏览器：
  - 深色模式下检查正文、badge、inline code、diff 元信息

**Step 3: 执行构建与测试**

- Run: `node --test tests/*.mjs`
- Run: `npm run build`

## 风险与回滚

- 风险 1：token 命名过粗，导致局部组件视觉风格被意外拉平。
  - 处理：先只覆盖高频阅读组件，观察范围可控。
- 风险 2：深色 token 提亮后桌面视觉过亮。
  - 处理：优先提升 `secondary/muted`，尽量少改 `primary`。
- 风险 3：局部 Tailwind 类与 token 并存，出现优先级冲突。
  - 处理：同一元素尽量只保留一种颜色来源，避免“类 + dark 覆盖 + token”叠加。

## 验收标准

- 手机端深色模式下，正文、次级文字、badge、inline code、diff 元信息清晰可读。
- 浅色模式视觉不回退、不发灰。
- `light / dark / auto` 切换时，消息区、输入区、代码预览区颜色一致。
- `node --test tests/*.mjs` 通过。
- `npm run build` 通过。

## 预期改动文件

- `docs/plans/2026-04-03-theme-contrast-plan.md`
- `src/style.css`
- `src/components/content/ThreadConversation.vue`
- `src/components/content/ThreadComposer.vue`
- `src/components/content/CodePreviewPanel.vue`
- `tests/theme-contrast-tokens.test.mjs`

## 执行后需补充

- 实际完成项与偏差
- 最终验证结果
- 如有剩余低优先级深色适配点，列入后续待办

---

## 实际执行结果

### 已完成

- 在 `src/style.css` 建立了浅色 / 深色语义色 token，并把全局容器切到 token 驱动。
- 在 `src/App.vue` 的主题应用逻辑里同步设置了 `document.documentElement.style.colorScheme`。
- 已将以下高频阅读区域改为消费 token：
  - `src/components/content/ThreadConversation.vue`
  - `src/components/content/ThreadComposer.vue`
  - `src/components/content/CodePreviewPanel.vue`
- 新增了主题 token 回归测试：`tests/theme-contrast-tokens.test.mjs`

### 与原计划的偏差

- 没有额外增加移动端专用 `@media` 补丁。
  - 原因：通过统一提升深色 token 的 `secondary / muted / chip / code` 对比度，已经能覆盖本轮主要问题，先避免引入第二套条件分支。
- 没有扩散到 sidebar / dropdown / settings 等低优先级区域。
  - 原因：本轮目标是先修复消息区、输入区、代码预览区这些高频阅读路径。

### 验证结果

- `node --test tests/*.mjs`
  - 结果：通过
- `npm run build`
  - 结果：通过

### 后续待办

- 如手机端深色模式下 sidebar 或菜单类组件仍有个别低对比文字，可按同样 token 方案继续迁移。
- 如后续需要更严格的可访问性保障，可补一层基于对比度阈值的视觉回归检查。
