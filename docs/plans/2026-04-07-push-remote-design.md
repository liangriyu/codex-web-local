# 当前分支推送远端能力设计

## 背景

当前仓库已经支持工作区级 Git 只读与部分写操作：

- 可读取当前工作区的 Git 状态、脏文件摘要与本地分支列表
- 可在受限条件下切换分支、创建并切换分支
- 所有写操作都经由本地 bridge 层调用 Git CLI，并复用工作区阻塞规则

但目前仍缺少“把当前分支推送到远端”的能力。用户如果要把本地提交发布到远端仓库，只能切回终端执行 `git push`。

本轮目标不是做完整 Git 发布面板，而是在现有分支能力旁边补一个受限、安全、可理解的一键 push 入口。

## 目标

- 支持把当前工作区当前分支推送到已配置的 upstream
- 当当前分支未配置 upstream 时，不直接失败，而是给出明确引导
- 复用现有工作区级 Git 阻塞规则，避免在高风险状态下执行 push
- 尽量沿用现有 branch 菜单和 bridge 架构，不引入新的通用命令系统

## 非目标

- 不支持手动选择 remote
- 不支持手动选择目标分支
- 不支持首次 push 时自动执行 `--set-upstream`
- 不支持 force push、push tags、push 多个 ref
- 不为认证、交互式凭证输入或复杂 hook 提供专门 UI
- 不依赖 upstream app-server 新增原生 `git push` RPC

## 现状分析

### 1. bridge 已具备扩展 Git 写操作的实现模式

`src/server/codexAppServerBridge.ts` 已直接通过本地 `git` 命令提供：

- `GET /codex-api/git/status`
- `GET /codex-api/git/branches`
- `POST /codex-api/git/branch/switch`
- `POST /codex-api/git/branch/create-and-switch`

这说明“push remote”可以沿用相同模式继续扩展，不需要先改 app-server 协议。

### 2. 状态层已有工作区级安全边界

当前分支能力已经把下列状态作为 Git 写操作阻塞条件：

- 非 Git 仓库
- 工作区存在脏文件
- 同一工作区存在待处理审批请求
- 同一工作区存在本地遗留审批阻塞记录
- 请求作用域无法明确归属到当前工作区

这套边界虽然比 Git 原生命令更严格，但与当前产品交互保持一致。push 属于同类高影响写操作，首版应继续复用。

### 3. app-server schema 没有现成 push 能力

当前 `documentation/app-server-schemas/` 中存在 `gitDiffToRemote`，但没有等价的 `git push` 方法。这意味着如果要做“推送远端”，最现实的路径是继续扩展本地 bridge，而不是等待或伪造协议能力。

## 方案对比

### 方案 A：最小同步调用方案

在 bridge 中直接新增 `POST /codex-api/git/push`，前端按钮点击后立即执行 `git push`。

优点：

- 改动最少
- 与现有分支写操作风格一致

缺点：

- 无法在执行前区分“未配置 upstream”和“无提交可推送”
- 失败提示完全依赖 Git stderr，用户理解成本高
- 按钮展示状态较弱

### 方案 B：推荐方案，预检 + 推送分离

新增一个只读预检接口和一个写接口：

- `GET /codex-api/git/push/status`
- `POST /codex-api/git/push`

预检接口负责返回当前分支、upstream、ahead/behind、是否具备 push 条件以及建议命令；写接口只在确认可推送后执行 `git push`。

优点：

- 能把“未配置 upstream”与普通失败明确区分
- UI 可以显示“可推送 / 已同步 / 需先绑定 upstream”等状态
- 仍然复用现有架构，不引入复杂事件系统

缺点：

- 比最小方案多一层状态模型
- 预检与实际 push 之间仍存在竞态

### 方案 C：通用命令执行方案

把 push 作为一类通用命令执行任务接入现有命令/事件体系，支持流式输出和潜在交互。

优点：

- 理论扩展性最好
- 后续 fetch/pull/rebase 也可复用

缺点：

- 对当前需求明显过重
- 会引入认证交互、任务生命周期、终端输出展示等额外范围

结论：采用方案 B。

## 推荐设计

### 1. 能力边界

首版仅支持：

- 当前 `cwd`
- 当前分支
- 已配置 upstream 的普通 `git push`

首版不支持：

- `git push --set-upstream`
- `git push --force`
- `git push origin HEAD:foo`
- 标签和多 ref 推送

### 2. 新增预检接口

新增：

- `GET /codex-api/git/push/status?cwd=...`

建议返回结构：

- `cwd`
- `isRepo`
- `currentBranch`
- `hasUpstream`
- `upstreamRemote`
- `upstreamBranch`
- `aheadCount`
- `behindCount`
- `hasCommitsToPush`
- `canPush`
- `blockedReasons`
- `suggestedUpstreamCommand`

关键语义：

- `hasUpstream=false` 时，不允许 push，但提供建议命令
- `hasCommitsToPush=false` 时，UI 显示“已同步”或“无可推送提交”
- `blockedReasons` 直接复用现有工作区 guard
- 预检只基于本地 Git 元数据，不主动访问远端网络

建议的 Git 读取方式：

- 当前分支：`git branch --show-current`
- upstream：`git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`
- ahead/behind：`git rev-list --left-right --count HEAD...@{upstream}`
- remote 默认分支信息可不读取，只有在生成建议命令时才需要本地 remote 名称

### 3. 新增 push 接口

新增：

- `POST /codex-api/git/push`

入参：

- `cwd`

服务端行为：

1. 校验 `cwd`
2. 调用现有 `getWorkspaceGuard(cwd)`
3. 若被阻塞，返回 `409` 与 `blockedReasons`
4. 校验当前分支存在且配置了 upstream
5. 执行 `git push`
6. 返回成功结果与目标 upstream 摘要

建议返回结构：

- `ok`
- `currentBranch`
- `upstreamRemote`
- `upstreamBranch`
- `summary`

### 4. 前端网关与状态层设计

在 `src/api/codexGateway.ts` 中新增：

- `fetchWorkspacePushStatus(cwd)`
- `pushWorkspaceBranch(cwd)`

在 `src/types/codex.ts` 中新增工作区 push 状态类型，例如：

- `UiWorkspacePushStatus`
- `UiWorkspacePushResult`

在 `src/composables/useDesktopState.ts` 中把 push 状态挂在 workspace 维度，而不是 thread 维度。建议字段：

- `push.status`
- `push.isLoading`
- `push.isPushing`
- `push.lastResult`
- `push.lastError`

刷新时机：

- 线程切换到新的 `cwd` 时
- branch 状态刷新后顺带刷新
- push 成功后立即刷新
- 分支切换/创建成功后刷新，避免沿用旧分支的 push 状态

### 5. UI 入口设计

入口继续放在 `ThreadComposer` 的 branch 菜单内，不新增独立页面。

推荐展示逻辑：

- `hasUpstream && hasCommitsToPush && !blocked`：显示主操作按钮，例如“推送到 origin/main”
- `hasUpstream && !hasCommitsToPush`：显示只读状态，例如“已同步”
- `!hasUpstream`：显示说明文案和建议命令，不显示 push 按钮
- `blockedReasons.length > 0`：沿用现有阻塞提示，不允许 push

这样做有两个好处：

- 用户心智保持一致，所有 Git 操作都集中在 branch 菜单
- push 不需要独立入口或新的全局状态面板

### 6. 错误处理

首版采用“未配置 upstream 专门引导，其它错误直接提示”的策略。

具体规则：

- 未配置 upstream：返回结构化状态，提示用户先在终端执行建议命令
- 非快进失败：直接展示 Git stderr
- 认证失败：直接展示 Git stderr
- 网络失败：直接展示 Git stderr
- hook 失败：直接展示 Git stderr

不额外设计错误分类体系，避免把需求扩展成完整 Git 客户端。

### 7. 阻塞策略

建议首版与 branch 写操作保持同一阻塞规则：

- `not_repo`
- `workspace_dirty`
- `pending_server_requests`
- `persisted_server_requests`
- `unresolved_server_request_scope`

说明：

- 从纯 Git 角度，dirty 工作区并不阻止 push
- 但从当前产品一致性与安全边界角度，push 仍属于高影响写操作
- 若 push 放宽而 switch branch 继续收紧，会让同一菜单下的 Git 行为规则不一致

因此首版建议保守复用，后续再根据真实使用反馈评估是否放宽

## 风险与取舍

### 1. 认证与交互风险

`git push` 可能触发凭证助手、SSH agent、pre-push hook 或网络等待。首版不做交互式终端承载，因此需要：

- 控制命令超时
- 明确向用户暴露失败信息
- 避免在 UI 上表现为永久加载

### 2. 预检与执行的竞态

预检显示可推送，并不保证执行时仍然可推送。远端可能在这段时间发生变化，导致最终 push 失败。这属于 Git 正常竞态，首版接受。

### 3. 本地元数据与远端真实状态可能不完全一致

若用户长时间未 fetch，ahead/behind 计算基于本地远端跟踪引用，而不是实时网络状态。首版接受这一取舍，因为它能换来更轻量、更稳定的状态接口。

### 4. detached HEAD 与特殊状态

若当前不在命名分支上，或仓库处于某些中间态，应直接视为不可 push，并返回明确提示，而不是尝试猜测目标 ref。

## 验收标准

- 当前分支已配置 upstream 且存在本地领先提交时，可以触发一键 push
- 当前分支未配置 upstream 时，不执行 push，而是展示建议命令
- push 与 branch 切换共用工作区级阻塞规则
- push 成功后，状态能刷新为“已同步”或“无可推送提交”
- 失败时用户能看到明确错误信息

## 后续可扩展方向

- 在 UI 中补“复制建议命令”
- 对认证失败、非快进失败做更友好的错误翻译
- 增加选择 remote / branch 的增强模式
- 评估是否需要在后续版本中放宽 `workspace_dirty` 阻塞
- 如果未来 app-server 原生支持 `git push`，再评估是否收敛回协议能力

## 关联文档

- 实施计划：[2026-04-07-push-remote-implementation-plan.md](./2026-04-07-push-remote-implementation-plan.md)

## 实施状态

### 2026-04-07 已落地范围

- 已在 bridge 层补充 `GET /codex-api/git/push/status` 与 `POST /codex-api/git/push`
- 已在前端网关、工作区状态层和 `ThreadComposer` 分支菜单中贯通 push 状态与触发动作
- 已按设计保留受限边界：仅支持当前分支推送到已配置 upstream
- 已对“未配置 upstream”返回建议命令，对其它失败继续直接透传 Git 错误
- 已补充异常回归保护：upstream 配置损坏时返回真实 Git 错误，不再误降级成“请先设置 upstream”的引导态

### 实际偏差

- UI 入口仍放在现有分支菜单内，但采用紧凑信息卡而非单独二级面板，减少交互复杂度
- push 状态额外补了一份源码约束测试，覆盖类型、网关、状态层、`App.vue` 与 `ThreadComposer.vue` 的接线
