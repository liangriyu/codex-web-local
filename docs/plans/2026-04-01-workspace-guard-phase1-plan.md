# Workspace Guard Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一 `workspace_dirty` 的阻塞判断与页面可见证据，让分支切换被阻塞时，用户始终能看到来自同一事实来源的 Git 脏状态说明。

**Architecture:** 在 bridge 层新增结构化工作区 Git 状态快照，统一解析 `git status --porcelain=v1 -uall` 生成 dirty 摘要与条目列表；前端状态层和分支菜单优先消费这份快照，现有 `workspace-changes` 继续保留用于 patch 展示，但不再承担“是否 dirty”的语义。审批持久化不在本阶段实现，只预留扩展位。

**Tech Stack:** Vue 3、TypeScript、Express middleware、Node `execFile`、Git CLI

---

### Task 1: 定义工作区守卫与结构化 Git 状态类型

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 补充类型定义**

- 新增结构化 dirty 条目类型。
- 新增 dirty 摘要类型。
- 如有必要，新增工作区守卫快照类型或最小版本的 Git 结构化状态类型。

**Step 2: 明确第一阶段范围**

- 第一阶段只覆盖 Git 脏状态结构化展示。
- 审批持久化字段先不实现，只保留后续扩展空间。

### Task 2: 在 bridge 层实现结构化 Git 状态读取

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 解析 `git status --porcelain=v1 -uall`**

- 编写状态解析函数，把每行拆成：
  - `x`
  - `y`
  - `path`
  - `kind`
  - `staged`
  - `unstaged`

**Step 2: 生成 dirty 摘要**

- 汇总：
  - tracked modified
  - staged
  - untracked
  - conflicted
  - renamed
  - deleted

**Step 3: 扩展 Git 状态接口**

- 让 `GET /codex-api/git/status` 返回结构化 dirty 信息，而不是只有 `isDirty` 布尔值。

**Step 4: 保持兼容**

- 保留 `isRepo`、`isDirty`、`currentBranch` 字段，避免一次性破坏前端现有逻辑。

### Task 3: 接入前端 API

**Files:**
- Modify: `src/api/codexGateway.ts`

**Step 1: 扩展状态解析**

- 解析新的 dirty 摘要与条目数组。

**Step 2: 保持老调用可运行**

- 若后端暂未返回新字段，前端安全降级为空摘要、空条目。

### Task 4: 在状态层保存结构化 Git 证据

**Files:**
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 扩展工作区分支状态**

- 为每个 `cwd` 保存 dirty 摘要与 dirty 条目。

**Step 2: 保持阻塞逻辑单一来源**

- `workspace_dirty` 仍由 Git 状态接口提供。
- 不再用 `workspace-changes` 是否为空来间接推断 dirty。

**Step 3: 继续兼容现有分支阻塞逻辑**

- 线程运行中、排队消息、审批请求阻塞逻辑先保持不变。

### Task 5: 在分支菜单中展示更可解释的 dirty 原因

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 提升阻塞提示粒度**

- 当 `workspace_dirty` 存在时，除了总提示外，补充显示 dirty 摘要。

**Step 2: 最小可见证据**

- 至少展示：
  - 未跟踪文件数量
  - 已修改文件数量
  - 已暂存变更数量
  - 冲突数量（若有）

**Step 3: 保持菜单复杂度可控**

- 第一阶段不在菜单中展开完整 patch
- 只展示解释性摘要与少量条目预览

### Task 6: 让工作区视图与阻塞证据对齐

**Files:**
- Modify: `src/App.vue`
- Modify: `src/api/codexGateway.ts`

**Step 1: 调整工作区 diff 统计语义**

- 现有 `workspaceDiffTotals` 继续表示 patch 统计，不再隐含“工作区是否干净”。

**Step 2: 在需要的位置接入结构化 dirty 信息**

- 若工作区视图为空但 dirty 仍存在，页面仍然能显示“原因摘要”。

### Task 7: 文档收尾与验证

**Files:**
- Modify: `docs/plans/2026-04-01-workspace-guard-phase1-plan.md`

**Step 1: 运行构建验证**

Run: `npm run build`
Expected: PASS

**Step 2: 补充执行结果**

- 记录实际完成项、偏差、验证结果、后续待办。

### 风险与回滚

- 风险：`git status` 解析不完整会导致摘要分类错误。
- 风险：前端菜单一次性展示过多 dirty 信息会影响可读性。
- 回滚：保留旧版 `isDirty` 判定与旧版分支菜单提示，移除结构化 dirty 摘要字段。

### 验收与验证命令

- 页面在存在未跟踪文件但 `workspace-changes` 为空时，仍能解释 `workspace_dirty` 阻塞原因。
- 分支菜单的阻塞说明与 Git 状态接口返回的结构化 dirty 信息一致。
- 现有分支切换/创建能力不回退。
- 验证命令：`npm run build`

## 执行结果

### 实际完成项

- 已在 bridge 层将 `GET /codex-api/git/status` 扩展为返回结构化 dirty 摘要与条目列表，底层改用 `git status --porcelain=v1 -uall` 解析。
- 已在 `src/types/codex.ts` 和 `src/api/codexGateway.ts` 中补充结构化 Git 脏状态类型与解析逻辑，并保持 `isRepo`、`isDirty`、`currentBranch` 兼容。
- 已在状态层为工作区分支状态补充 `dirtySummary` 和 `dirtyEntries`，使分支阻塞与可见证据共享同一 Git 状态来源。
- 已在分支菜单中增加 dirty 摘要标签和文件预览列表，能直接解释 `workspace_dirty` 的具体来源。
- 已在主页面正文增加“隐藏 dirty 状态提示”，当 patch 统计为 0 但工作区仍处于 dirty 时，会明确提示未跟踪文件/冲突等非 patch 型状态。
- 已移除调试期临时加入的页面调试面板，恢复正常 UI。

### 实际偏差

- 计划中的“工作区守卫快照”在本阶段没有一次性完整引入，而是先以“结构化 Git 状态 + 现有阻塞规则复用”的方式落地，优先修复最确定的问题。
- 审批持久化仍未实现，当前分支阻塞里的审批部分依旧属于实时或 bridge 当前可恢复状态，不属于结构化 Git 状态快照范畴。

### 验证结果

- 2026-04-01：执行 `npm run build` 通过。

### 后续待办

- 在 bridge 层补充审批未闭合记录的持久化账本，并把它接入统一工作区守卫模型。
- 评估是否将结构化 dirty 信息扩展到工作区 diff 预览面板，而不仅是分支菜单和正文提示。
- 视后续反馈决定是否把“结构化 Git 状态 + 阻塞规则 + 审批状态”统一收敛成单独的 `WorkspaceGuardSnapshot` 接口。
