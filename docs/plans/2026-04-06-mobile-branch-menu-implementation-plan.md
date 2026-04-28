# Mobile Branch Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把手机端分支列表从触发器浮层改为底部抽屉，修复左侧裁切问题，同时保持桌面端分支菜单交互不变。

**Architecture:** 继续复用 `ThreadComposer` 现有的分支数据和行为逻辑，只在展示层增加桌面端浮层与移动端抽屉的双形态渲染。移动端通过遮罩、抽屉容器、独立滚动区和固定底部操作区承载分支状态、列表与创建表单，避免依赖触发器横向定位。

**Tech Stack:** Vue 3、Tailwind `@apply`、Scoped CSS、Node `node:test`

---

### Task 1: 为移动端分支抽屉写失败测试

**Files:**
- Create: `tests/mobileBranchMenuLayout.test.mjs`

**Step 1: 为移动端抽屉形态写源码约束测试**

- 断言 `ThreadComposer.vue` 在手机断点存在分支抽屉样式或遮罩样式标识
- 断言移动端不再只依赖固定 `w-64 + right-0` 浮层承载分支内容

**Step 2: 为桌面端保留浮层写约束测试**

- 断言桌面端分支浮层样式仍保留
- 断言分支行为逻辑仍由原有状态字段驱动

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/mobileBranchMenuLayout.test.mjs`
Expected: FAIL，表现为当前源码缺少移动端分支抽屉相关结构或样式约束

### Task 2: 实现移动端分支菜单双形态渲染

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`

**Step 1: 为分支菜单增加移动端遮罩与抽屉容器**

- 保留现有桌面端菜单结构
- 为手机端增加 `branch-sheet` 容器和 backdrop

**Step 2: 复用现有分支内容块**

- 让标题、提示、dirty summary、persisted records、分支列表和创建表单继续使用现有状态
- 避免复制分支选择与创建逻辑

**Step 3: 补关闭路径**

- 点击遮罩关闭
- 选择分支成功后关闭
- 创建分支成功后关闭

### Task 3: 收紧移动端布局与信息密度

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`

**Step 1: 为抽屉设置视口与安全区约束**

- 宽度限制为 `calc(100vw - 24px)` 与合理 `max-width`
- 高度限制在 `70vh` 左右，并处理 `safe-area-inset-bottom`

**Step 2: 让中部列表独立滚动**

- dirty preview 和 persisted records 维持紧凑展示
- 分支列表滚动，不让底部创建区被挤出

**Step 3: 收敛移动端表单布局**

- 超窄屏下允许新建分支输入区纵向排列
- 保持按钮可点击面积与文本可读性

### Task 4: 验证与文档回填

**Files:**
- Modify: `docs/plans/2026-04-06-mobile-branch-menu-implementation-plan.md`

**Step 1: 运行测试**

Run: `node --test tests/mobileBranchMenuLayout.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录实际修改文件
- 记录验证命令和结果
- 记录与计划偏差

## Notes

- 按仓库约定，本计划默认不包含 `git add` / `git commit` 步骤
- 若实现时发现 `ThreadComposer.vue` 模板分支过重，再单独评估是否拆分移动端分支面板组件

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/components/content/ThreadComposer.vue`
- `tests/mobileBranchMenuLayout.test.mjs`
- `docs/plans/2026-04-06-mobile-branch-menu-design.md`
- `docs/plans/2026-04-06-mobile-branch-menu-implementation-plan.md`

**验证记录:**
- `node --test tests/mobileBranchMenuLayout.test.mjs`：PASS
- `npm run build`：PASS
- Playwright `390x844` 实机视口复测：PASS
  - 分支按钮边界：`left=25`、`right=225.21875`、`innerWidth=390`
  - 分支抽屉边界：`left=12`、`right=378`、`innerWidth=390`
  - 抽屉截图：`.playwright-cli/page-2026-04-06T14-35-40-950Z.png`

**与计划偏差:**
- 未新增独立移动端分支组件，而是在现有 `thread-composer-branch-menu` 上叠加 `thread-composer-branch-sheet` 与 backdrop，复用原有分支内容块和行为逻辑
- 关闭路径通过 backdrop、关闭按钮以及既有的分支切换/创建成功后关闭三条路径共同覆盖，未增加额外键盘交互逻辑
- 实机复测额外发现移动端分支入口会被额度标签挤出可点击区，因此在手机断点下补充了底部控件换行与状态组整行布局，保证分支入口先可见、可点，再触发抽屉
