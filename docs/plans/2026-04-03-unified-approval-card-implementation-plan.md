# Unified Approval Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为命令审批与文件变更审批提供统一的中文产品化审批卡体验，补齐命令、原因、目录、授权选项和文件变更摘要展示。

**Architecture:** 在 `ThreadConversation.vue` 中保留审批请求挂载点，但把 `item/commandExecution/requestApproval` 与 `item/fileChange/requestApproval` 抽到统一审批卡组件中。展示层通过一个轻量 helper 将 request `params` 规范化成 UI 模型，组件只负责渲染和返回审批决定；其他 request 类型继续沿用现有降级渲染，避免本轮范围失控。

**Tech Stack:** Vue 3、TypeScript、scoped CSS、Node `node:test`、现有 `uiText` i18n 体系

---

### Task 1: 固定统一审批卡的展示与决策映射

**Files:**
- Modify: `docs/plans/2026-04-03-unified-approval-card-design.md`
- Create: `docs/plans/2026-04-03-unified-approval-card-implementation-plan.md`

**Step 1: 固定命令审批展示字段**

- 标题、说明、命令文本、执行目录、触发原因
- 存在 `commandActions` 时补充“预计操作”摘要
- 存在 `proposedExecpolicyAmendment` 时显示“减少重复确认”的规则授权说明

**Step 2: 固定文件审批展示字段**

- 标题、说明、文件数、增删统计、文件摘要列表
- 保留“查看完整 Diff”入口，不在卡片里内嵌完整 diff

**Step 3: 固定决策映射**

- 命令审批第二选项：
  - 有 `proposedExecpolicyAmendment` 时映射为 `acceptWithExecpolicyAmendment`
  - 否则映射为 `acceptForSession`
- 文件审批第二选项映射为 `acceptForSession`
- `cancel` 走“跳过”按钮，不纳入主选项组

### Task 2: 先为审批展示 helper 写失败测试

**Files:**
- Create: `src/utils/approvalRequestDisplay.ts`
- Create: `tests/approvalRequestDisplay.test.mjs`

**Step 1: 为命令审批解析写测试**

- 输入带 `command`、`cwd`、`reason`、`commandActions`
- 断言 helper 能输出完整展示模型
- 断言选项 2 在有规则建议时映射为规则授权

**Step 2: 为命令审批回退逻辑写测试**

- 输入缺少 `proposedExecpolicyAmendment`
- 断言选项 2 自动回退为 `acceptForSession`
- 输入缺少 `command` 或 `cwd` 时也能安全渲染占位文本

**Step 3: 为文件审批解析写测试**

- 输入文件变更 request 参数
- 断言 helper 能输出统计、摘要文件列表和审批选项

**Step 4: 运行测试并确认先失败**

Run: `node --test tests/approvalRequestDisplay.test.mjs`
Expected: FAIL，提示缺少审批展示 helper 导出或行为不匹配

### Task 3: 实现审批展示 helper

**Files:**
- Create: `src/utils/approvalRequestDisplay.ts`
- Test: `tests/approvalRequestDisplay.test.mjs`

**Step 1: 定义统一的审批展示模型**

- 区分命令审批与文件审批
- 输出：
  - 卡片标题与说明
  - 主展示内容
  - 选项列表
  - 默认选中项
  - 最终响应 payload 所需的 decision 信息

**Step 2: 实现命令审批解析**

- 解析 `command`、`cwd`、`reason`
- 将 `commandActions` 转成可读摘要
- 将 `proposedExecpolicyAmendment` 保存到选项元数据

**Step 3: 实现文件审批解析**

- 解析文件列表、增删统计、说明文本
- 对过长文件列表做摘要截断

**Step 4: 重新运行 helper 测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs`
Expected: PASS

### Task 4: 新增统一审批卡组件

**Files:**
- Create: `src/components/content/ApprovalRequestCard.vue`
- Modify: `src/i18n/uiText.ts`
- Test: `tests/approvalRequestUi.test.mjs`

**Step 1: 实现统一卡片骨架**

- 标题区
- 说明区
- 内容区插槽或按类型分支
- 单选式选项区
- 底部 `提交 / 跳过` 操作区

**Step 2: 接入中文产品化文案**

- 命令审批标题、说明、字段标签
- 文件审批标题、说明、字段标签
- 通用操作文案：
  - `提交`
  - `跳过`
  - `查看完整 Diff`

**Step 3: 实现桌面端与移动端样式**

- 准弹层视觉层级
- 命令块等宽展示并支持横向滚动
- 文件摘要列表紧凑展示
- 移动端按钮堆叠与热区优化

### Task 5: 在会话流中接入统一审批卡

**Files:**
- Modify: `src/components/content/ThreadConversation.vue`
- Modify: `src/utils/approvalRequestDisplay.ts`
- Test: `tests/approvalRequestUi.test.mjs`

**Step 1: 用统一审批卡替换两类审批请求的旧渲染**

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`

**Step 2: 保留其他 request 的旧回退逻辑**

- `item/tool/requestUserInput`
- `item/tool/call`
- 未知 request

**Step 3: 让提交逻辑走 helper 输出的 decision**

- 选中项只更新本地状态
- 点击 `提交` 后再调用 `respondServerRequest`
- 点击 `跳过` 时返回 `cancel`

### Task 6: 补充组件接线回归测试

**Files:**
- Create: `tests/approvalRequestUi.test.mjs`
- Test: `src/components/content/ApprovalRequestCard.vue`
- Test: `src/components/content/ThreadConversation.vue`
- Test: `src/i18n/uiText.ts`

**Step 1: 断言新组件已创建并被接入**

- `ThreadConversation.vue` 引用统一审批卡组件
- 不再直接把两类审批卡渲染成 method 名 + 一排按钮

**Step 2: 断言关键文案已存在**

- `是否允许执行此命令？`
- `是否允许应用这些文件改动？`
- `提交`
- `跳过`

**Step 3: 断言命令审批具备规则授权分支**

- 组件或 helper 中存在 `acceptWithExecpolicyAmendment` 映射

### Task 7: 验证、文档回填与构建确认

**Files:**
- Modify: `docs/plans/2026-04-03-unified-approval-card-implementation-plan.md`

**Step 1: 运行审批 helper 测试**

Run: `node --test tests/approvalRequestDisplay.test.mjs`
Expected: PASS

**Step 2: 运行审批 UI 相关测试**

Run: `node --test tests/approvalRequestUi.test.mjs`
Expected: PASS

**Step 3: 运行现有测试集合**

Run: `node --test tests/*.mjs`
Expected: PASS

**Step 4: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 5: 回填执行结果**

- 记录实际新增/修改文件
- 记录验证命令与结果
- 标注是否仍有后续增强项

### 风险与回滚

- 风险：文件变更审批 request 参数如果不包含完整统计，helper 需要兼容占位显示，不能因为字段缺失而整卡不可用。
- 风险：命令审批新增“规则授权”后，如果按钮文案与真实 decision 映射不一致，会造成用户误判，因此测试必须覆盖映射逻辑。
- 风险：移动端上命令块与底部按钮区容易拥挤，样式需要优先保证可读性和可点击性。
- 回滚：移除 `ApprovalRequestCard.vue`，恢复 `ThreadConversation.vue` 里的两类旧审批分支，并删除审批展示 helper 与新增文案即可恢复旧行为。

### 验收与验证命令

- 命令审批卡展示中文标题、命令、目录、原因与清晰选项。
- 文件审批卡展示中文标题、变更摘要、文件列表和完整 diff 入口。
- 命令审批在存在规则建议时提供“减少重复确认”的授权路径。
- 其他 request 类型仍保持现有可用性。
- `node --test tests/approvalRequestDisplay.test.mjs` 通过。
- `node --test tests/approvalRequestUi.test.mjs` 通过。
- `node --test tests/*.mjs` 通过。
- `npm run build` 通过。

## 执行结果

### 实际完成项

- 已新增 `src/utils/approvalRequestDisplay.ts`，把命令审批与文件变更审批 request 解析成统一 UI 展示模型。
- 已新增 `src/components/content/ApprovalRequestCard.vue`，提供统一审批卡壳子、中文产品化选项区和 `提交 / 跳过` 操作区。
- 已修改 `src/components/content/ThreadConversation.vue`，将命令审批和文件变更审批接入统一审批卡，并把“跳过”映射为 `decision: 'cancel'`。
- 已修改 `src/i18n/uiText.ts`，补充审批卡标题、字段标签、文件摘要和操作文案。
- 已新增 `tests/approvalRequestDisplay.test.mjs` 与 `tests/approvalRequestUi.test.mjs`，覆盖 helper 行为和会话组件接线。

### 实际偏差

- 文件变更审批 request 本身不携带文件列表，因此最终方案复用了线程里的 `fileChanges` 数据；只有当 `request.turnId` 与 `fileChanges.turnId` 匹配时，审批卡才展示文件清单和增删统计。
- 当前仍保留其他非审批类 request 的旧降级卡片，只把标题从底层 method 名替换为更可读的中文说明，没有一并统一重做。
- 当前“规则授权”的具体规则文本没有展开成可视化明细，只在第二选项里以“减少重复确认”方式表达。

### 验证结果

- 2026-04-03：已通过 `node --test tests/approvalRequestDisplay.test.mjs`。
- 2026-04-03：已通过 `node --test tests/approvalRequestUi.test.mjs`。
- 2026-04-03：已通过 `node --test tests/*.mjs`。
- 2026-04-03：已通过 `npm run build`。

### 后续待办

- 如果后端后续为文件审批 request 直接补充文件级 payload，可去掉对 `fileChanges` 的耦合。
- 可继续为 `item/tool/requestUserInput`、`item/tool/call` 等 request 引入同一套审批壳子。
- 可继续补“规则授权展开说明”“审批结果 toast”与更细的移动端微交互。
