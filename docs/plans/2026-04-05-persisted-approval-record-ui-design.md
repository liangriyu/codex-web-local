# Persisted 审批记录 UI 语义修正设计

## 背景

当前 Web 端已经能区分 live pending request 与 persisted server request 的数据来源，但主内容区仍会把 persisted 未处理记录表达成“授权待处理”。

现场验证发现：

- `GET /codex-api/server-requests/pending` 已返回空数组
- `GET /codex-api/server-requests/persisted` 仍残留未解决记录
- UI 仍展示 “等待处理 / 2 条授权待处理”

这会让用户误以为现在有可以立刻点击审批的 live request，但实际没有任何可提交的审批入口。

## 目标

- 明确区分“当前可审批的 live request”和“历史遗留的 persisted 记录”
- 当 live approvals 为 0 且 persisted records 大于 0 时，不再显示“授权待处理”
- 改为明确提示“发现未解决授权记录，需要重新触发审批”
- 保持真正的 live approval 浮层和审批卡不回退

## 非目标

- 不把 persisted 记录变成可重新提交的审批
- 不改 bridge 的 persisted ledger 结构
- 不重做 ThreadComposer 的分支保护逻辑

## 推荐方案

### 1. SharedSessionStatusCard 使用本地线程实时计数修正文案

`SharedSessionStatusCard` 当前只看 snapshot 里的合并 attention 计数，因此无法知道：

- 现在是否还有 live approval
- 还是只剩 persisted records

最小修法是在 `App.vue` 中把当前线程的：

- `selectedThreadServerRequests.length`
- `selectedThreadPersistedServerRequests.length`

作为额外 props 传给 `SharedSessionStatusCard`。

这样卡片层就能在不修改 snapshot 文件结构的前提下，针对当前线程做准确表达。

### 2. 文案分流规则

当：

- `liveApprovalCount > 0`

继续显示：

- 状态：`等待处理`
- attention：`X 条授权待处理`

当：

- `liveApprovalCount === 0`
- `persistedApprovalCount > 0`

改为显示：

- 状态：`发现遗留记录`
- attention：`发现 X 条未解决授权记录，需要重新触发审批`
- pill：`X 条遗留授权记录`

### 3. 衍生 attention timeline 也使用分流文案

当前 status card 会自动往 timeline 里补一条 derived attention 文本。这里也必须复用同一分流规则，否则正文会继续出现“2 条授权待处理”的误导。

## 方案对比

### 方案 A：修改 shared session snapshot schema

优点：

- 数据表达最完整

缺点：

- 涉及 projector、store、类型与多处测试
- 本轮明显超出修复目标

### 方案 B：仅在 UI 层做语义修正

优点：

- 改动最小
- 能直接解决用户当前误解

缺点：

- 只对当前线程视角准确，不改变 snapshot 本身的合并统计

结论：本轮采用方案 B。

## 实现落点

- `src/App.vue`
  - 把 `selectedThreadPersistedServerRequests` 一并传给 `SharedSessionStatusCard`
- `src/components/content/SharedSessionStatusCard.vue`
  - 接收 `liveApprovalCount` 与 `persistedApprovalCount`
  - 用分流规则生成状态标签、attention 文案和 pill 文案
- `src/i18n/uiText.ts`
  - 新增 persisted 记录提示文案
- `tests/sharedSessionStatusCard.test.mjs`
  - 验证 persisted 语义文案
- `tests/sidebarSharedSessionOverview.test.mjs`
  - 验证 `App.vue` 接线

## 测试策略

- live approvals > 0 时仍显示旧文案
- live=0 且 persisted>0 时显示“遗留记录/重新触发审批”文案
- `App.vue` 正确向 `SharedSessionStatusCard` 传入 live/persisted 计数
- `npm run build` 回归通过
