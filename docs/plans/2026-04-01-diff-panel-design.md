# 工作区 Diff + Git Status 差异面板设计文档

## 背景

当前项目已经有两套与工作区差异相关的能力：

- 工作区 patch 视图：基于 `git diff` / `git diff --cached`，用于展示可形成 unified diff 的文件变更
- 工作区 Git 状态：基于 `git status --porcelain=v1 -uall`，用于判断 `workspace_dirty` 和解释部分阻塞原因

最近暴露出的体验问题是：

- 用户打开工作区 diff，却无法完整理解为什么当前工作区仍被 `workspace_dirty` 阻塞
- 页面已经能识别未跟踪文件、冲突、重命名等状态，但这些信息只是以提示块形式附着在页面上，不是正式的一等视图
- 用户希望像 Codex app 那样，在一个统一差异面板里切换查看不同粒度和来源的差异

本设计文档目标是定义一个更清晰的差异浏览模型，使差异面板能够在不同 Git 视角之间切换，而不是把所有信息硬塞进同一个“diff 列表”。

## 目标

差异面板第一阶段支持 4 种模式：

- `未暂存`
- `已暂存`
- `全部分支更改`
- `上一轮更改`

其中：

- `全部分支更改` 定义为：当前分支相对基线分支 merge-base 的累计改动
- `上一轮更改` 定义为：当前工作区最近一次 commit，也就是 `HEAD` 对应提交的改动

同时，本设计保留后续扩展 `Git Status` 正式视图的空间，但第一阶段不强制一起实现。

## 现状分析

### 1. 当前 diff 面板承担的是 patch 语义，不是完整 Git 状态语义

bridge 层当前用于工作区差异展示的主要实现是：

- `collectWorkspaceChanges()`：
  - `git diff --numstat`
  - `git diff --cached --numstat`
  - 再按文件读取 staged / unstaged patch

这意味着当前面板天然偏向“可形成 patch 的内容变更”。

### 2. 当前工作区脏状态使用的是另一套事实来源

工作区守卫和隐藏状态提示来自：

- `readWorkspaceGitStatus()`
  - `git status --porcelain=v1 -uall`

它能够看见：

- 未跟踪文件
- 冲突
- 重命名
- 删除
- staged / unstaged 组合状态

这些状态并不都适合直接伪装成 patch 列表项。

### 3. 现有 UI 混合了“变更内容”和“阻塞解释”

目前 [App.vue](../../src/App.vue) 中已经有 `workspaceDirtyHiddenNotice`，说明当前系统已经意识到：

- “工作区有状态”
- “但它们没有被当前 diff 面板完整表达”

这说明真正的问题不是“缺一个 if”，而是当前产品结构尚未把“差异视图”和“状态视图”拆开。

## 设计原则

### 1. 差异模式必须是显式语义，不允许隐式切换

用户看到的每一个模式，都必须能清楚知道它回答的是哪一个问题：

- 工作区尚未暂存的内容差异
- 工作区已暂存但未提交的内容差异
- 当前分支累计引入的内容差异
- 最近一次提交的内容差异

### 2. 不把非 patch 状态伪装成 patch

未跟踪文件、冲突态、某些 rename / unknown 状态，不应该强行塞进 `diff` 结果里冒充普通 patch。否则会制造“看起来很精确，但语义其实不成立”的假象。

### 3. 同一个面板可以承载多个 diff 视角，但每个视角必须有独立数据来源

不建议把所有模式都先算成一个“大杂烩结构”再前端硬分。更合理的方式是：

- 统一 UI 容器
- 不同模式使用不同 Git 命令
- 返回统一展示结构

### 4. 第一阶段先做 4 种 diff 模式，不强绑 Git Status

`Git Status` 是下一步很自然的扩展，但这次用户明确需要的是类似 Codex app 的差异面板，因此第一阶段先聚焦 diff 模式，避免一次把 scope 拉太大。

## 方案对比

### 方案 A：继续扩展现有 workspace diff 面板

做法：

- 保留当前 workspace diff 数据结构
- 在前端顶部增加 4 个模式筛选
- 后端继续分别暴露多个零散接口

优点：

- 改动看似较小

缺点：

- 面板继续堆积多种职责
- 后端会继续增长多个语义分散的 endpoint
- 前端更难维护“当前模式究竟代表什么”

不推荐。

### 方案 B：引入统一“差异面板模式”接口（推荐）

做法：

- bridge 新增统一模式化接口
- 每个模式内部映射到不同 Git 命令
- 前端只关心当前模式和统一返回结构

优点：

- UI 统一
- 后端语义清晰
- 最适合后续增加 `Git Status` 作为第 5 个视角

缺点：

- 需要对现有 workspace diff 链路做一层抽象

推荐实施。

### 方案 C：拆成两个面板，“工作区差异”和“历史差异”

做法：

- `未暂存 / 已暂存` 放一组
- `全部分支更改 / 上一轮更改` 放另一组

优点：

- 从数据来源上最容易理解

缺点：

- 交互不够统一
- 不像 Codex app 那种在一个差异面板内切换视角

不推荐。

## 设计结论

采用方案 B：做成一个统一差异面板，内部支持 4 个显式模式切换。

## 模式定义

### 1. 未暂存

定义：

- 当前工作区中尚未 staged 的内容变更

建议 Git 来源：

- 文件列表：`git diff --numstat`
- patch：`git diff -- <path>`

### 2. 已暂存

定义：

- 当前工作区已 staged、但尚未提交的内容变更

建议 Git 来源：

- 文件列表：`git diff --cached --numstat`
- patch：`git diff --cached -- <path>`

### 3. 全部分支更改

定义：

- 当前分支相对基线分支 merge-base 的累计改动

第一阶段基线分支策略：

- 优先 `main`
- 若不存在则尝试 `master`
- 两者都不存在则返回空结果并给出明确说明

建议 Git 来源：

- `merge-base <baseBranch> HEAD`
- `git diff <mergeBase> HEAD --numstat`
- `git diff <mergeBase> HEAD -- <path>`

说明：

- 第一阶段不支持用户自定义 base branch
- 第一阶段不尝试处理复杂 fork-point 语义

### 4. 上一轮更改

定义：

- 当前工作区最近一次 commit，即 `HEAD` 提交的改动

建议 Git 来源：

- 文件列表：`git show --numstat --format= HEAD`
- patch：`git show --format= HEAD -- <path>`

说明：

- 第一阶段明确定义为“最近一次 commit”
- 不扩展成“最近一次分支操作”

## 统一返回结构

建议在 bridge 中统一返回：

```ts
type WorkspaceDiffMode = 'unstaged' | 'staged' | 'branch' | 'lastCommit'

type WorkspaceDiffModeResponse = {
  mode: WorkspaceDiffMode
  cwd: string
  label: string
  baseRef: string | null
  targetRef: string | null
  files: Array<{
    path: string
    additions: number
    deletions: number
    diff: string
  }>
}
```

说明：

- `label` 用于前端直接展示当前模式说明
- `baseRef / targetRef` 让 UI 能解释“比较的两端是什么”
- `files` 继续复用当前 patch 视图的数据结构，降低前端改造成本

## 前端交互设计

### 面板入口

继续复用当前右侧预览区 / 代码预览面板，不另开新页面。

### 面板头部

新增模式切换控件，形式可为 segmented control：

- 未暂存
- 已暂存
- 全部分支更改
- 上一轮更改

### 默认模式

建议默认策略：

- 首次打开差异面板时优先 `未暂存`
- 若 `未暂存` 为空且 `已暂存` 非空，则自动切到 `已暂存`
- 历史模式由用户手动切换

### 文件列表区

继续展示：

- 路径
- additions
- deletions

### patch 区

继续展示 unified diff，不改变当前阅读方式。

### 模式说明

头部增加简短说明，例如：

- `全部分支更改：当前分支相对 main 的累计改动`
- `上一轮更改：最近一次提交的改动`

## 与 Git Status 的关系

本设计不把 `Git Status` 强行并入 4 个 diff 模式。

原因：

- `Git Status` 回答的是“工作区当前状态是什么”
- 4 个 diff 模式回答的是“内容差异是什么”

后续可以把 `Git Status` 作为第 5 个 tab 增加进同一面板，但这不属于本次第一阶段范围。

## 风险与边界

### 1. 全部分支更改的基线分支不一定总能正确代表用户意图

第一阶段用 `main/master` 兜底，只能满足大部分常规仓库。若用户分支实际基于其他 release 分支，展示结果会偏大或偏小。

### 2. 上一轮更改只代表 `HEAD`，不代表“最近一次工作动作”

这与用户现在确认的需求一致，但文案需要明确，避免被理解成“最近一次切分支”。

### 3. 大分支 diff 可能比较重

`全部分支更改` 在大分支上可能产生大量 patch。第一阶段先接受现有性能成本，必要时后续再做懒加载或分页。

## 分阶段建议

### 第一阶段

- 新增统一 diff mode 接口
- 接入 4 个模式
- 保持当前 patch 面板 UI，增加顶部模式切换

### 第二阶段

- 增加当前模式记忆
- 优化大 diff 加载策略
- 完善“空结果”与“基线分支缺失”的解释

### 第三阶段

- 评估把 `Git Status` 作为第 5 个模式纳入同一面板

## 成功标准

- 用户可在一个统一差异面板中切换：
  - 未暂存
  - 已暂存
  - 全部分支更改
  - 上一轮更改
- 每种模式都有明确、稳定的 Git 语义
- 不再用提示块去兜底不同类型的差异来源

## 实施结果摘要

- 已在 bridge 层实现统一 `workspace-diff-mode` 接口，并支持 `unstaged / staged / branch / lastCommit` 四种模式。
- 已在前端预览面板中增加 4 个模式 tab、模式说明和空状态提示。
- 已在 `App.vue` 中接入当前差异模式状态，并实现首次打开时“优先未暂存，空则回退到已暂存”的默认行为。
- 当前阶段仍保留单独的工作区 Git Status / 隐藏状态提示，尚未把 `Git Status` 正式纳入同一差异面板。
