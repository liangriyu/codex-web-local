# Base Branch 本地自动推导设计

## 背景

当前分支已经支持：

- `Git Status` 作为工作区面板的一等视图
- `WorkspaceModel.branch.baseBranch` 按 `cwd` 持久化
- `branch` diff 模式支持用户显式选择 `baseBranch`

但自动推导部分仍然偏弱，当前 bridge 主要按：

1. 用户手动指定的 `baseBranch`
2. `main`
3. `master`

来决定 `全部分支更改` 的比较基线。

这在很多仓库中都不够稳定，例如：

- 默认分支是 `develop` / `dev`
- 本地已存在 `origin/HEAD -> origin/develop`
- 仓库有多个 remote，实际默认基线不在 `main/master`

如果要继续向 Codex app 的页面体验靠近，这块应该升级为：

- 本地 Git 优先
- 自动推导比 `main/master` 更稳
- 推导失败时诚实返回 warning
- 用户始终可以显式覆盖

## 目标

让 `baseBranch` 自动推导遵循以下原则：

- 严格只依赖本地 Git 信息
- 不做网络探测
- 不自动 `git fetch`
- 推导结果可被用户按 `cwd` 显式覆盖
- 推导失败时返回可解释 warning，而不是静默落到错误比较

## 为什么采用“严格本地 Git 信息”方案

这是当前项目最合适的策略，原因有三点：

1. 与 Codex app / 本地 App Server 的保守默认更一致
- 当前项目本身是本地 bridge 架构
- 多数页面能力都建立在本地工作区和本地 Git 状态上
- 基础 diff 语义不应绑在网络可用性上

2. 行为更稳定
- 离线可用
- 权限模型更简单
- 不受远程不可达、未登录、代理异常影响

3. 用户覆盖路径已经存在
- 既然当前项目已经有 `baseBranch` 按 `cwd` 配置能力
- 自动推导只需要“尽量正确”
- 不必为了追求远程最新状态而引入隐式联网

## 现状问题

### 1. 自动推导只覆盖最常见仓库

当前仅尝试 `main/master`，明显不足。

### 2. 无法利用本地 remote HEAD 信息

很多仓库本地已经有：

- `refs/remotes/origin/HEAD`
- 其他 remote 的 `HEAD`

这些本来就是更强的“默认分支”线索，但当前未使用。

### 3. warning 语义仍然过粗

当前更多是在“候选没找到”时返回 warning，还没有区分：

- 用户指定的 `baseBranch` 本地不存在
- 本地没有 remote HEAD
- 最终只好退回常见候选
- 完全无法推导

## 方案对比

### 方案 A：继续只用 `main/master`

优点：

- 实现最简单

缺点：

- 误判率高
- 与当前已经补上的 `baseBranch` 配置能力不匹配

不推荐。

### 方案 B：本地 Git 优先的多层推导（推荐）

推导顺序：

1. 用户显式选择的 `baseBranch`
2. 当前分支所属 remote 的 `HEAD`
3. `origin/HEAD`
4. 其他 remote 的 `HEAD`
5. 常见本地默认分支候选
6. 推导失败，返回 warning

优点：

- 离线可用
- 明显优于 `main/master`
- 仍然范围可控

缺点：

- 需要 bridge 增加一些本地 ref 解析逻辑

推荐采用。

### 方案 C：自动联网推导远程默认分支

优点：

- 理论上能拿到更新的远程默认分支

缺点：

- 违背当前项目的本地优先语义
- 引入权限、网络和失败回退复杂度
- 不符合“基础 diff 语义默认离线可用”的目标

当前不推荐。

## 推荐设计

采用方案 B：本地 Git 优先的多层推导。

### 推导顺序

#### 第 1 层：用户显式覆盖

若 `WorkspaceModel.branch.baseBranch` 有值，且本地分支存在：

- 直接使用
- 不再继续自动推导

若用户显式指定的分支本地不存在：

- 返回 warning
- 再进入自动推导流程

#### 第 2 层：当前分支所属 remote 的 `HEAD`

优先尝试从当前分支的 upstream 推导 remote 名称，例如：

- 当前分支 upstream 是 `origin/feature/x`
- 则先尝试 `refs/remotes/origin/HEAD`

若存在：

- 解析为目标分支，例如 `origin/develop`
- 取短名 `develop`

这是最接近“该工作流上下文中的默认基线”的本地信号。

#### 第 3 层：`origin/HEAD`

若当前分支没有可用 upstream，或其 remote HEAD 不存在：

- 尝试 `refs/remotes/origin/HEAD`

#### 第 4 层：其他 remote 的 `HEAD`

枚举本地 remote refs 中的 `*/HEAD`：

- 若存在一个清晰候选，使用它
- 若存在多个冲突候选，优先 `origin`
- 若没有 `origin`，取第一个稳定排序结果，并返回轻 warning 说明

#### 第 5 层：常见本地默认分支候选

本地分支候选顺序建议扩成：

1. `main`
2. `master`
3. `develop`
4. `dev`
5. `trunk`

只在本地分支存在时使用。

#### 第 6 层：失败并返回 warning

若以上都失败：

- `baseBranch = null`
- 返回明确 warning，例如：
  - `Unable to infer a base branch from local Git metadata`

## 具体实现建议

### Bridge 层

在 [src/server/codexAppServerBridge.ts](../../src/server/codexAppServerBridge.ts) 中，把当前 `resolveBaseBranch()` 拆成更清晰的 3 组辅助函数：

- `branchExists(cwd, branch)`
- `resolveRemoteHeadBranch(cwd, remote)`
- `inferBaseBranchFromLocalGit(cwd, options)`

建议优先使用如下本地命令：

- `git rev-parse --abbrev-ref <ref>`
- `git symbolic-ref refs/remotes/<remote>/HEAD`
- `git for-each-ref refs/remotes --format='%(refname:short)'`
- `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`

注意：

- 所有失败都应视为可恢复分支，不直接抛致命错误
- 只有真正执行 diff 时缺少基线，才通过 snapshot warning 暴露给前端

### 状态层

当前前端已经按 `cwd` 保存 `baseBranch` 偏好。

这一轮无需调整存储结构，只需确保：

- bridge 返回的 `baseRef` 和 `warning` 能继续回写到 snapshot
- `WorkspaceModel.branch.baseBranch` 继续表示“用户配置值”，而不是“自动推导结果”

也就是说：

- 用户配置值和自动推导值要区分
- UI 上显示“当前比较基线”时，应优先使用 snapshot 的 `baseRef`

### 展示层

[CodePreviewPanel.vue](/Users/riyuliang/workspace/coding/opencode/codex-web-local/src/components/content/CodePreviewPanel.vue) 不需要大的结构调整，只需补更准确的解释：

- 若用户显式配置了 `baseBranch`，显示该值
- 若未显式配置但 snapshot 返回了 `baseRef`，显示自动推导结果
- 若存在 warning，继续展示 warning

## warning 语义建议

为了减少“看起来能比，但其实基线不稳定”的误解，建议区分以下几类 warning：

- 用户指定的 `baseBranch` 本地不存在，已回退自动推导
- 未找到 remote HEAD，已回退常见默认分支候选
- 存在多个 remote HEAD，已优先选用某个 remote
- 无法从本地 Git 信息推导基线分支

## 非目标

这轮不做：

- 自动 `git fetch`
- 网络 API 查询默认分支
- 基于 fork-point 的复杂比较语义
- 仓库级全局设置页

## 验收标准

满足以下条件视为完成：

1. `branch` 模式优先使用用户显式 `baseBranch`
2. 未显式配置时，能优先利用本地 remote HEAD 信息
3. `main/master` 只是候选而不是唯一自动推导路径
4. 推导失败时页面能看到明确 warning
5. 全过程不依赖网络、不自动 fetch

