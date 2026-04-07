# 首次推送自动建立 Upstream 设计

## 背景

当前 web 版“推送远端”能力已经支持：

- 当前工作区当前分支的 push 预检
- 已配置 upstream 时执行普通 `git push`
- 未配置 upstream 时展示建议命令

但当前行为仍与 `codex app` 不一致：

- `codex app` 已能在“当前分支没有 upstream”时直接点击推送
- web 版仍要求用户先回终端执行 `git push --set-upstream ...`

这会造成同一分支在两个入口中的可推送状态不一致，用户体验割裂。

## 目标

- 对齐 `codex app` 的首版边界，让 web 在“无 upstream”场景下也可直接推送
- 首次推送时自动建立 upstream
- 保持当前 branch 菜单入口与 bridge 架构，不引入新面板
- 不把需求扩展成完整 Git 发布面板

## 非目标

- 不支持手选 remote
- 不支持手选目标分支
- 不支持 force push
- 不支持 tags / 多 ref push
- 不增加认证、冲突解决、hook 流式输出专门 UI

## 现状分析

### 1. 现有实现把“无 upstream”视为不可推送

当前服务端 `resolveWorkspacePushMetadata()` 在 `@{upstream}` 不存在时返回：

- `hasUpstream: false`
- `canPush: false`
- `suggestedUpstreamCommand: git push --set-upstream ...`

对应前端 `ThreadComposer` 的按钮逻辑也是：

- `!hasUpstream` 时只显示说明文案
- 不显示 push 按钮

这与 `codex app` 当前行为不一致，但实现收敛清晰，改动范围可控。

### 2. 当前 bridge 已具备承载首次 push 的条件

已有能力：

- 能解析当前分支
- 能解析 remote 列表并推断推荐 remote
- 能执行受 guard 保护的 `git push`

所以首次推送不需要新协议，只需要把“无 upstream”的写路径从报错改成执行：

- `git push --set-upstream <remote> <currentBranch>`

## 方案对比

### 方案 A：仅放宽 UI，仍提示建议命令

做法：

- UI 上对 `!hasUpstream` 也显示推送按钮
- 点击后仍提示建议命令，不自动执行

优点：

- 改动最小

缺点：

- 没有真正对齐 `codex app`
- 只是把“不能推”换成“点了再提示”

### 方案 B：推荐方案，服务端自动执行首次 push

做法：

- `GET /codex-api/git/push/status` 在无 upstream 时返回“可首次推送”的状态
- `POST /codex-api/git/push` 在无 upstream 时自动执行 `git push --set-upstream <remote> <branch>`

优点：

- 真正对齐 `codex app`
- 仍然只扩一条最小路径，不引入复杂参数

缺点：

- 需要重新定义 `canPush` 在无 upstream 场景下的语义

### 方案 C：弹出选择 remote / branch

做法：

- 无 upstream 时弹交互让用户选 remote 和目标分支

优点：

- 更灵活

缺点：

- 明显超出当前需求
- 会把 UI 和状态复杂度显著抬高

结论：采用方案 B。

## 推荐设计

### 1. 行为边界

web 版 push 调整为：

- 已有 upstream：执行 `git push`
- 无 upstream：执行 `git push --set-upstream <suggestedRemote> <currentBranch>`

其中：

- `suggestedRemote` 优先取 `origin`
- 若无 `origin`，取本地第一个 configured remote
- 目标远端分支名与当前本地分支同名

### 2. Push 状态语义调整

`GET /codex-api/git/push/status` 在无 upstream 时不再简单视为不可推送，而是区分两层语义：

- `hasUpstream`: 是否已存在 tracking branch
- `canPush`: 当前是否允许点击 push

新的语义应为：

- `!hasUpstream && currentBranch 存在 && guard 未阻塞`：`canPush = true`
- `hasUpstream && aheadCount > 0 && guard 未阻塞`：`canPush = true`
- `hasUpstream && aheadCount = 0`：`canPush = false`

补充字段建议：

- `willSetUpstream: boolean`

这样前端不用猜测，只按状态渲染：

- `willSetUpstream=true`：显示“推送并关联远端”
- 其它已存在 upstream 且 ahead>0：显示“推送到 origin/branch”

### 3. Push 写接口调整

`POST /codex-api/git/push` 的服务端行为调整为：

1. 校验 `cwd`
2. 复用 `getWorkspaceGuard(cwd)`
3. 校验当前分支存在
4. 若 `hasUpstream=true`，执行 `git push`
5. 若 `hasUpstream=false`，执行 `git push --set-upstream <suggestedRemote> <currentBranch>`
6. 返回最终 remote / branch / summary

成功后的返回建议统一为：

- `currentBranch`
- `upstreamRemote`
- `upstreamBranch`
- `summary`
- `createdUpstream: boolean`

### 4. 前端展示调整

`ThreadComposer` 中 push 区块改为：

- `!hasUpstream && canPush`：显示主按钮“推送并关联远端”
- `!hasUpstream && !canPush`：显示说明文案与阻塞原因
- `hasUpstream && hasCommitsToPush && canPush`：显示“推送到 origin/xxx”
- `hasUpstream && !hasCommitsToPush`：显示“已同步”

建议保留建议命令文案，但从主路径降级为辅助信息：

- 当无 upstream 时仍显示建议命令，便于用户理解实际执行内容
- 但不再把它作为唯一操作方式

### 5. 错误处理

无 upstream 自动 push 后，失败处理仍保持现有策略：

- 认证失败：透传 Git stderr
- 非快进失败：透传 Git stderr
- hook 失败：透传 Git stderr
- remote 不存在：透传 Git stderr

不额外设计首次 push 专属错误体系。

## 验收标准

- 当前分支无 upstream 时，branch 菜单显示“推送并关联远端”
- 点击后执行首次 push，并自动建立 upstream
- push 成功后刷新状态，菜单切换为普通 push / 已同步状态
- 有 upstream 的普通 push 场景保持不回退
- `npm run build` 通过

## 风险与取舍

### 1. 风险：默认 remote 猜测可能不符合少数仓库习惯

首版仍固定：

- 优先 `origin`
- 否则第一个 remote

这是与 `codex app` 当前边界一致的最小取舍。

### 2. 风险：首次 push 会创建远端 tracking 关系

这是预期行为，不是副作用。因为对齐目标本来就是“点击一次完成首次推送与绑定”。

### 3. 风险：与旧设计文档存在边界冲突

之前的 push 设计明确把“自动 `--set-upstream`”列为非目标。本次是范围升级，需在计划和实现结果里明确标注为 v2 行为，避免后续误读。
