# Mobile Composer Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复手机端输入框聚焦时输入器底部控件被放大挤压的问题，并让首页项目选择下拉在移动端居中显示。

**Architecture:** 保持现有 `ThreadComposer` 与首页 `ComposerDropdown` 结构不变，只在移动端断点补充更严格的样式约束。输入器通过 16px 输入字号和更明确的 `flex/min-width` 规则避免 iOS focus zoom 与按钮变形；首页项目列表通过手机端居中定位改善视觉对齐。

**Tech Stack:** Vue 3、Tailwind `@apply`、Scoped CSS、Node `node:test`

---

### Task 1: 为移动端输入器与项目下拉写失败测试

**Files:**
- Create: `tests/mobileComposerLayout.test.mjs`

**Step 1: 为输入器写样式约束测试**

- 断言 `ThreadComposer.vue` 在手机端包含 `16px` 输入字号
- 断言发送按钮和停止按钮有固定宽度/最小宽度约束
- 断言状态组和分支胶囊在手机端支持压缩与截断

**Step 2: 为首页项目下拉写样式约束测试**

- 断言 `App.vue` 在手机端让项目下拉居中展开
- 断言菜单宽度受视口限制

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/mobileComposerLayout.test.mjs`
Expected: FAIL，表现为当前源码缺少这些移动端样式约束

### Task 2: 实现移动端输入器样式修复

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`

**Step 1: 修复输入聚焦自动放大**

- 在手机断点下把输入框字号提升为 `16px`

**Step 2: 固定发送/停止按钮尺寸**

- 为发送/停止按钮增加固定 `flex-basis` 与 `min-width`

**Step 3: 让状态组和分支胶囊可压缩**

- 允许状态组 `min-width: 0`
- 让分支胶囊在手机端截断而不是顶出动作按钮

### Task 3: 实现首页项目下拉居中

**Files:**
- Modify: `src/App.vue`

**Step 1: 为首页项目下拉增加手机端居中定位**

- 仅在 `new-thread-folder-dropdown` 的手机端样式中生效
- 菜单水平居中，并限制最大宽度

### Task 4: 验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-05-mobile-composer-layout-implementation-plan.md`

**Step 1: 运行测试**

Run: `node --test tests/mobileComposerLayout.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录实际修改文件
- 记录验证命令和结果
- 记录与计划偏差

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/App.vue`
- `src/components/content/ComposerDropdown.vue`
- `src/components/content/ThreadComposer.vue`
- `tests/mobileComposerLayout.test.mjs`
- `docs/plans/2026-04-05-mobile-composer-layout-design.md`
- `docs/plans/2026-04-05-mobile-composer-layout-implementation-plan.md`

**验证记录:**
- `node --test tests/mobileComposerLayout.test.mjs`：PASS
- `npm run build`：PASS

**与计划偏差:**
- 未新增额外组件或 dropdown prop，首页项目列表的手机端居中直接通过 `App.vue` 的局部深度样式完成
- 输入器问题的根因按 iOS focus zoom 和窄屏挤压共同处理，最终通过移动端字号、压缩约束和固定动作按钮尺寸一并收口
