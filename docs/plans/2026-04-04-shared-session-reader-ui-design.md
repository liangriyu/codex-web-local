# Shared Session Reader UI Design

**背景**

当前 web 侧共享会话读模型有三个明显问题：
- bridge 刷新快照时会把 owner 写死为 `web`，导致 Codex App 正在控制的会话在 web 中被误显示成 `当前由 Web 控制`
- 详情页顶部状态卡只渲染一大段摘要，无法稳定展示最近几条共享进展
- 侧边栏线程行新增副标题后，标题、副标题和时间都在紧凑布局里竞争空间，长标题时容易互相遮挡

**目标**

在不引入 takeover / 审批交互的前提下，把共享会话读 UI 调整为“读得准、看得清”：
- web 侧优先继承已有快照中的真实 owner 信息，不再把外部控制端误写成 `web`
- 顶部状态卡保留只读定位，但正文改成最近共享进展列表，最多显示 3 条
- 侧边栏线程行改成更稳的主列 + 时间列布局，避免标题、摘要、时间重叠

**非目标**

- 不新增跨端写入协议
- 不新增审批按钮、接管按钮或跳转动作
- 不改线程消息主流的结构和排序

**方案对比**

1. 只修样式，不改快照来源
   - 优点：改动最小
   - 缺点：owner 仍然会错，属于症状修复

2. 继承已有快照 owner，并把状态卡改成最近进展列表
   - 优点：能同时修正“显示错控制端”和“右侧信息不够可读”两个核心问题
   - 缺点：需要补一组 bridge/UI 回归测试

3. 直接做完整共享时间线面板
   - 优点：信息最丰富
   - 缺点：会和主消息流职责重叠，这一轮超出范围

**采用方案**

采用方案 2。

**设计细节**

1. owner 继承
   - `syncSharedSessionSnapshot()` 写新快照前先读取已有快照
   - 若已有快照存在且 owner 信息有效，则继承 `owner`、`ownerInstanceId`、`ownerLeaseExpiresAtIso`
   - 仅在没有历史快照时回退到当前 web writer 的默认 owner

2. 顶部状态卡
   - 头部仍显示状态 chip 与控制端说明
   - 正文改成最近共享进展列表，优先显示最近 3 条 `assistant_message`、`turn_summary`、`attention`
   - 若没有可展示时间线，再回退到单条摘要
   - metadata pills 保留，但弱化为补充信息

3. 侧边栏线程行
   - 线程主体列改成独立伸缩列，标题和共享摘要都在主列中截断
   - 时间单独占固定宽度的右列，不再挤占正文宽度
   - hover 操作区继续复用现有右侧插槽，不改交互

**验证**

- `tests/sharedSessionBridge.test.mjs` 新增 owner 继承测试
- `tests/sharedSessionStatusCard.test.mjs` 新增时间线列表结构测试
- `tests/sidebarSharedSessionOverview.test.mjs` 新增布局约束测试
- 最终运行相关测试与 `npm run build`
