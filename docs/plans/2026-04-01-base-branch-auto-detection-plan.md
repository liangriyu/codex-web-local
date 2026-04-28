# Base Branch 本地自动推导 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `baseBranch` 自动推导从 `main/master` 硬编码升级为严格依赖本地 Git 信息的多层推导。

**Architecture:** 在 bridge 层集中实现本地 ref 解析和 remote HEAD 推导；前端继续保留按 `cwd` 的用户显式配置，并通过 snapshot `baseRef/warning` 展示“实际使用的比较基线”。

**Tech Stack:** Node.js、TypeScript、Vue 3、Git CLI

---

### Task 1: 收敛当前 bridge 的 baseBranch 推导入口

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts`
- Reference: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/docs/plans/2026-04-01-base-branch-auto-detection-design.md`

**Step 1: 定位当前 `resolveBaseBranch()` 与 `branch` diff 入口**

检查：
- 当前 preferred branch 校验逻辑
- 当前 `main/master` fallback 逻辑
- 当前 snapshot warning 生成位置

**Step 2: 抽出基础 Git 辅助函数**

增加最小辅助函数：
- `branchExists(cwd, branch)`
- `resolveRemoteHeadBranch(cwd, remote)`
- `listRemoteHeadRefs(cwd)`
- `resolveUpstreamRemote(cwd)`

要求：
- 仅使用本地 Git 命令
- 失败时返回 `null` 或空数组，不抛致命异常

**Step 3: 保持原有行为不变并通过构建**

Run: `npm run build`  
Expected: PASS

### Task 2: 实现本地 Git 优先的多层自动推导

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/server/codexAppServerBridge.ts`

**Step 1: 实现推导顺序**

顺序必须为：
1. 用户显式配置且本地存在
2. 当前 upstream remote 的 `HEAD`
3. `origin/HEAD`
4. 其他 remote 的 `HEAD`
5. `main/master/develop/dev/trunk`
6. 失败返回 warning

**Step 2: 为每个回退阶段写清 warning 语义**

至少覆盖：
- 用户指定分支不存在
- 使用了 remote HEAD fallback
- 使用了常见默认分支 fallback
- 完全失败

**Step 3: branch snapshot 返回实际 `baseRef`**

确保 branch diff 最终返回：
- `baseRef`
- `targetRef`
- `warning`

语义一致。

### Task 3: 校准前端显示语义

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue`
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/i18n/uiText.ts`
- Reference: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/types/codex.ts`

**Step 1: 明确显示“当前比较基线”**

优先展示 snapshot 的 `baseRef`，而不是只展示用户配置值。

**Step 2: 用户配置值与自动推导值分开表达**

若存在显式配置：
- 显示配置值

若无显式配置但有自动推导值：
- 显示自动推导结果

若推导失败：
- 仅显示 warning

**Step 3: 补必要文案**

为以下情况准备文案：
- 自动推导基线
- 已回退默认候选
- 未能推导

### Task 4: 贯通验证

**Files:**
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/docs/plans/2026-04-01-base-branch-auto-detection-design.md`
- Modify: `/Users/riyuliang/workspace/coding/opencode/codex-web-local/docs/plans/2026-04-01-base-branch-auto-detection-plan.md`

**Step 1: 运行构建**

Run: `npm run build`  
Expected: PASS

**Step 2: 人工验证至少 4 个本地场景**

建议验证：
- 仓库存在 `origin/HEAD -> origin/main`
- 仓库存在 `origin/HEAD -> origin/develop`
- 本地没有 remote HEAD，但有 `develop`
- 用户显式指定不存在的 `baseBranch`

**Step 3: 回填文档结果**

在文档中记录：
- 实际采用的本地推导顺序
- 最终 warning 语义
- 已知边界

