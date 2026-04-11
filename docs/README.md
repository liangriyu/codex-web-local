# 文档总览

本目录是代理与开发者的统一文档入口，负责“按任务快速定位”。

## 按任务类型找入口
- 运行/启动/调试/排障：先看 [runtime/README.md](./runtime/README.md)
- Cloudflare Tunnel 域名不稳定：看 [runtime/cloudflare-tunnel-troubleshooting.md](./runtime/cloudflare-tunnel-troubleshooting.md)
- 业务流程/模块职责/行为约束：先看 [business/README.md](./business/README.md)
- API 协议、消息结构、schema 维护：先看 [contracts/README.md](./contracts/README.md)
- 多步骤改造、跨目录重构：先看 [plans/README.md](./plans/README.md)

## 分层原则
- 运行问题优先看 `runtime/`。
- 协议字段、消息结构、schema 索引优先看 `contracts/`。
- 复杂改造先在 `plans/` 写计划，再执行。

## 新文档放置规则（最小决策）
- 启动、部署、联调、排障：`runtime/`
- 业务流程、模块设计、约束说明：`business/`
- OpenAPI / JSON Schema / 事件协议 / 生成规则：`contracts/`
- 多步骤任务拆解、里程碑、验收：`plans/`

## 文档更新触发矩阵
- 命令行参数或运行命令变更：同步更新 `README.md` 与 `runtime/`。
- 契约或 schema 变更：同步更新 `contracts/`。
- 目录/文件路径变更：同步更新所有引用链接。

## 代理接手推荐路径
1. 读根目录 `AGENTS.md` 明确边界和验证门禁。
2. 读本页选择任务入口。
3. 执行任务前后对照 [runtime/agent-handoff.md](./runtime/agent-handoff.md) 检查交付完整性。
