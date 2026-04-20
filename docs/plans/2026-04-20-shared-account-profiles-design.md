# Shared 模式账号档案设计

## 背景

- 当前 `codex-web-local` 的 `shared` 模式已经能 attach 到桌面版 Codex.app，或在 attach 不可用时通过只读 sidecar 回退读取账号与线程。
- 但账号档案体系仍然只在 `isolated` 模式可见和可切换：
  - 前端仅在 `serverConnectionMode === 'isolated'` 时展示档案列表。
  - `switchAccountProfile()` 在 `shared` 模式下会直接拒绝。
- 结果是：
  - Web 端在 `shared` 模式下只能观察桌面当前账号，不能复用已有档案，也不能创建新档案后立即切换桌面账号。
  - 用户无法把 `codex-web-local` 现有档案体系作为桌面版 Codex.app 的账号扩展层。

## 问题定义

这次改造解决的是“在 `shared` 模式下真正支持切账号档案”，但边界必须非常明确：

1. 切换的是桌面版 Codex.app 的当前账号，不是 shared 会话库。
2. 切换后要立即生效，也就是目标档案的登录材料要写回桌面 `~/.codex/auth.json`。
3. shared 模式下线程列表、线程详情、会话历史仍然跟随桌面当前会话库，不切到某个 isolated profile 的 `codexHomeDir`。
4. shared 模式下既支持切换已有档案，也支持“新建档案并登录后立即切换桌面账号”。

## 目标

### 必须满足

- `shared` 模式下显示可见账号档案列表。
- `shared` 模式下允许切换已有档案。
- 切换已有档案时，把目标档案的账号材料同步回桌面 `~/.codex/auth.json`，并立即刷新账号中心。
- `shared` 模式下允许新建档案并完成登录。
- 新建档案登录成功后，立即把新档案的账号材料同步回桌面 `~/.codex/auth.json`。
- shared 模式切档案只影响账号，不影响线程/会话数据源。

### 明确不做

- 不让 shared 模式切换线程历史所属的会话库。
- 不把 shared 模式变成 isolated profile 的完整运行环境。
- 不复制 `state_5.sqlite`、`session_index.jsonl`、`sessions/` 等会话产物到桌面 home。
- 不要求桌面版 Codex.app 重启后才生效，目标是立即生效。

## 可选方案

### 方案 A：在 shared 模式下复用现有 profile 目录，但只把它当账号材料容器

做法：

- 继续使用 `AccountProfileStore` 管理 `codex-web-local/profiles/<id>`。
- 在 `shared` 模式下，切档案时不再把 `CODEX_HOME` 切到 profile 目录。
- 改为只读取目标 profile 的 `auth.json`，原子写回桌面 `~/.codex/auth.json`。
- 登录时仍先在目标 profile 目录内完成授权，再把结果同步到桌面 home。

优点：

- 能复用现有档案创建、可见性判断、名称装饰和登录物料存储逻辑。
- 改动面集中在 bridge、前端状态和少量 profile store 语义调整。

缺点：

- 需要把“账号档案切换”和“运行时 `CODEX_HOME` 切换”彻底拆开，避免语义混淆。

结论：

- 推荐。

### 方案 B：新增一套 shared 专用账号档案存储

做法：

- 为 shared 模式单独建一套 `desktop-account-profiles.json` 和目录结构。
- isolated 与 shared 各自维护各自的账号档案。

优点：

- 模型最纯粹，概念上更清晰。

缺点：

- 重复建设，用户现有档案无法复用。
- 新增大量迁移和双系统维护成本。

结论：

- 当前不采用。

### 方案 C：shared 模式直接覆盖桌面当前账号，不保留档案列表

做法：

- 只支持“登录一个新账号并覆盖桌面当前账号”。
- 不展示或不维护可切换的其他档案。

优点：

- 实现最简单。

缺点：

- 不满足“直接真正支持 shared 模式切档案”的目标。

结论：

- 不采用。

## 推荐方案

采用 **方案 A**：

- 继续使用现有 `AccountProfileStore` 作为账号档案来源。
- 但在 `shared` 模式下，把 profile 目录严格视为“账号材料容器”，而不是 shared 会话库或运行时 home。
- 对桌面实际生效的始终是桌面 `~/.codex/auth.json`。

## 设计方案

### 1. 账号档案与会话库解耦

- `AccountProfileStore` 继续负责：
  - 创建 profile 目录
  - 读取 `auth.json`
  - 产出可见档案列表
- `CodexAppServerBridge` 在 `shared` 模式下切档案时：
  - 不调用 `setActiveCodexHomeDir(profile.codexHomeDir)`
  - 不修改 shared 线程读取的数据 home
  - 只同步账号材料到桌面 home

这意味着：

- shared 模式下的“当前活跃档案”是账号选择器语义；
- shared 模式下的线程列表与线程详情仍然来自桌面当前会话库；
- isolated 模式保留现有“账号与会话一起跟随 profile”的语义。

### 2. 桌面账号材料同步

- 新增一个桌面账号材料同步步骤，目标文件是桌面 home 的 `auth.json`。
- 同步来源是：
  - 切已有档案时：目标 profile 目录的 `auth.json`
  - 新建档案登录成功时：新 profile 目录的 `auth.json`
- 同步要求：
  - 使用原子写入，避免桌面进程在写入中途读到半文件
  - 如果目标 profile 没有 `auth.json`，切换直接失败并向 UI 返回明确错误

### 3. 立即生效语义

- 写回桌面 `auth.json` 后，需要让 shared 账号读取链路立即失效并重建：
  - 清理只读 sidecar fallback
  - 丢弃当前账号缓存/状态缓存
  - 重新读取 `config/read`、`account/read`、`account/rateLimits/read`
- 如果共享 attach 已连接，则后续读取仍优先走真实 shared transport。
- 如果当前处于 `running_without_shared_endpoint`，则新的账号读取会通过桌面 home 绑定的只读 sidecar返回。

### 4. 新建档案并登录

- shared 模式下放开“新建档案并登录”的入口。
- 登录过程仍然在新建 profile 目录对应的环境中完成，避免污染桌面 home 的中间态。
- 登录完成后：
  - 把该 profile 标记为当前账号档案
  - 将新 profile 的 `auth.json` 同步到桌面 home
  - 刷新账号中心，使桌面当前账号立即变成新账号

### 5. 前端展示与交互

- shared 模式下显示档案列表，不再隐藏。
- shared 模式下允许点击切换已有档案。
- shared 模式下显示“新建档案并登录”入口。
- 文案必须明确：
  - “切换账号档案会立即影响共享的 Codex.app 当前账号”
  - “线程与会话历史仍来自桌面当前 shared 会话库”

### 6. 错误处理

- shared 模式切档案时的失败类型应至少包含：
  - 目标档案不存在
  - 目标档案没有可用 `auth.json`
  - 写回桌面账号材料失败
  - 写回后刷新账号状态失败
- 这些错误要直接回到账号中心，而不是被统一吞成“shared 模式当前不可用”。

### 7. 测试策略

- store 单测：
  - shared 模式下列出的可见档案仍正确
  - 有 `auth.json` 的档案可见，没登录材料的 inactive 档案仍隐藏
- bridge 单测：
  - shared 模式切已有档案会覆盖桌面 `auth.json`
  - shared 模式切已有档案不会切换线程读取使用的 home
  - shared 模式新建档案登录成功后会覆盖桌面 `auth.json`
  - 切档案后账号读取来自新账号
- UI 单测：
  - shared 模式下显示档案列表
  - shared 模式下显示“新建档案并登录”入口
  - shared 模式下切换档案不再报“共享模式下不支持切换账号档案”

## 风险与控制

### 风险 1：shared 模式又重新和 isolated profile 语义纠缠

- 控制方式：
  - 在 bridge 层显式分离“账号档案切换”和“运行时 home 切换”。
  - shared 模式下禁止用 `setActiveCodexHomeDir(profile.codexHomeDir)` 改线程来源。

### 风险 2：桌面进程读取 `auth.json` 时遇到不完整写入

- 控制方式：
  - 使用临时文件 + rename 的原子写入方式。

### 风险 3：切换后账号中心展示已更新，但桌面端仍缓存旧状态

- 控制方式：
  - 写回后立即清理只读 fallback 实例并重读账号 RPC。
  - 如果 attach 已连接，则以 shared transport 的实时返回为准；如果未连接，则以桌面 home sidecar 为准。

## 结论

- shared 模式真正支持切档案的关键，不是把 isolated profile 完整搬进 shared，而是把 profile 当作“账号材料来源”。
- 只要切档案时同步桌面 `auth.json`，并保持线程/会话库不切换，就能满足“扩展桌面 Codex.app 账号能力”的目标。
- 这条路径能复用现有档案体系，同时保持 shared / isolated 的核心语义不被混淆。
