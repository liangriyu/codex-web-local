# Push Remote Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为当前工作区补充“把当前分支推送到已配置 upstream”的能力，并在未配置 upstream 时提供明确引导。

**Architecture:** 继续沿用本地 bridge + Git CLI 的实现路径，在 bridge 层新增 push 预检与写接口，在状态层维护工作区级 push 状态，在现有分支菜单中增加 push 展示与触发入口。首版只支持当前分支推送到已配置 upstream，复用现有工作区 guard，不引入通用命令执行系统。

**Tech Stack:** Vue 3、TypeScript、Express middleware、Node `execFile`、Git CLI、Node `node:test`

---

### Task 1: 为 push 预检和写接口补测试

**Files:**
- Modify: `tests/codexAppServerBridge.test.mjs`

**Step 1: 为预检接口写失败测试**

- 补 `GET /codex-api/git/push/status` 的基础用例
- 覆盖非仓库、无当前分支、未配置 upstream、已配置 upstream 且无可推送提交、已配置 upstream 且有 ahead 提交

**Step 2: 为写接口写失败测试**

- 补 `POST /codex-api/git/push` 的基础用例
- 覆盖 guard 阻塞、未配置 upstream、成功 push、Git 命令失败透传

**Step 3: 运行测试并确认先失败**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: FAIL，表现为 bridge 尚未提供 push 相关接口或返回结构不匹配

### Task 2: 在 bridge 层实现 push 预检能力

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 增加 Git push 状态读取辅助函数**

- 读取当前分支
- 读取 upstream
- 解析 ahead/behind
- 生成建议的 `--set-upstream` 命令文本

**Step 2: 定义服务端返回结构**

- 增加 push status 的内部类型定义
- 保持字段命名与前端工作区模型一致

**Step 3: 暴露只读接口**

- 新增 `GET /codex-api/git/push/status`
- 参数仅接受 `cwd`
- 对错误返回稳定结构与明确提示

### Task 3: 在 bridge 层实现 push 写接口

**Files:**
- Modify: `src/server/codexAppServerBridge.ts`

**Step 1: 复用现有 guard**

- push 前调用 `getWorkspaceGuard(cwd)`
- 若存在阻塞原因，返回 `409`

**Step 2: 增加 push 执行函数**

- 校验当前分支存在
- 校验已配置 upstream
- 执行 `git push`

**Step 3: 返回结果摘要**

- 返回当前分支、upstream remote、upstream branch 和用户可读的成功摘要
- 失败时直接透传 Git stderr

### Task 4: 接入前端网关与类型

**Files:**
- Modify: `src/types/codex.ts`
- Modify: `src/api/codexGateway.ts`

**Step 1: 定义工作区 push 类型**

- 新增 `UiWorkspacePushStatus`
- 新增 `UiWorkspacePushResult`
- 如有需要，增加 push 阻塞文案使用的辅助字段

**Step 2: 实现网关请求函数**

- 新增 `fetchWorkspacePushStatus(cwd)`
- 新增 `pushWorkspaceBranch(cwd)`

**Step 3: 统一错误封装**

- 沿用现有 `normalizeCodexApiError`
- 保持未配置 upstream 与普通失败可区分

### Task 5: 在状态层维护工作区 push 状态

**Files:**
- Modify: `src/composables/useDesktopState.ts`

**Step 1: 增加 workspace 级 push 状态存储**

- 增加 loading、pushing、status、lastResult、lastError

**Step 2: 增加刷新入口**

- 在线程切换到新工作区时读取 push status
- 在 branch 状态刷新后联动刷新 push status
- push 成功后重新读取 push status

**Step 3: 暴露操作方法**

- 提供选中工作区与指定 `cwd` 的 push 方法
- 统一处理错误和 loading 状态

### Task 6: 在分支菜单中增加 push UI

**Files:**
- Modify: `src/components/content/ThreadComposer.vue`
- Modify: `src/i18n/uiText.ts`

**Step 1: 增加 push 状态展示**

- 已配置 upstream 且有可推送提交时显示 push 主按钮
- 已同步时显示只读状态
- 未配置 upstream 时显示引导说明和建议命令

**Step 2: 增加 push 触发动作**

- 点击按钮触发 workspace push
- 执行中显示 loading 文案并禁用重复点击

**Step 3: 复用阻塞提示**

- 继续沿用现有 branch 阻塞摘要
- 不为 push 新建独立 guard 体系

### Task 7: 回填文档并完成验证

**Files:**
- Modify: `docs/plans/2026-04-07-push-remote-design.md`
- Modify: `docs/plans/2026-04-07-push-remote-implementation-plan.md`

**Step 1: 运行 bridge 测试**

Run: `node --test tests/codexAppServerBridge.test.mjs`
Expected: PASS

**Step 2: 运行构建**

Run: `npm run build`
Expected: PASS

**Step 3: 回填执行结果**

- 记录实际修改文件
- 记录验证命令与结果
- 记录计划偏差与后续待办

## Notes

- 首版不引入选择 remote / branch 的高级模式
- 首版不处理交互式认证 UI，只展示结果
- 按仓库约定，本计划默认不包含 `git add` / `git commit` 步骤

## Related Docs

- 设计文档：[2026-04-07-push-remote-design.md](./2026-04-07-push-remote-design.md)

---

## Execution Result

**状态:** 已完成

**实际修改文件:**
- `src/server/codexAppServerBridge.ts`
- `tests/codexAppServerBridge.test.mjs`
- `src/types/codex.ts`
- `src/api/codexGateway.ts`
- `src/composables/useDesktopState.ts`
- `src/components/content/ThreadComposer.vue`
- `src/App.vue`
- `src/i18n/uiText.ts`
- `tests/pushRemoteUi.test.mjs`
- `docs/plans/2026-04-07-push-remote-implementation-plan.md`

**验证记录:**
- `node --test tests/codexAppServerBridge.test.mjs`：PASS
- `node --test tests/pushRemoteUi.test.mjs`：PASS
- `node --test tests/codexAppServerBridge.test.mjs tests/pushRemoteUi.test.mjs`：PASS（7/7）
- `npm run build`：PASS

**实际结果摘要:**
- bridge 层新增 `GET /codex-api/git/push/status` 和 `POST /codex-api/git/push`
- push status 返回当前分支、upstream、ahead/behind、blockedReasons 和建议命令
- 写接口复用现有 `getWorkspaceGuard(cwd)`，阻塞时返回 `409`
- 前端已把 push 状态接入 `WorkspaceModel`，并在 branch 菜单中新增推送状态、引导文案和推送按钮
- 当前分支未配置 upstream 时，菜单会显示建议命令；已同步时显示只读状态；有可推送提交时显示推送按钮
- upstream 配置损坏时，bridge 会直接返回真实 Git 错误，不再误判为“未配置 upstream”

**与计划偏差:**
- 额外补了一条源码约束测试 `tests/pushRemoteUi.test.mjs`，用于锁定 `types/gateway/useDesktopState/App/ThreadComposer/uiText` 的接线关系
- UI 文案统一落在现有 branch 菜单语义下，采用 `branchPush*` 命名，而不是单独引入新的全局 push 面板
- 额外补了一条 bridge 回归测试，覆盖“upstream 配置损坏时直接透传真实 Git 错误”的场景

**后续待办:**
- 如需更强可用性，可继续补“复制建议命令”
- 如需更强稳定性，可继续评估非快进失败、认证失败的更细粒度文案
- 如需更强能力，可继续扩展选择 remote / branch、首次 `--set-upstream` 辅助和 force push 防护
