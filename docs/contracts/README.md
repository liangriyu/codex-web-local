# Contracts 文档

## 目标
记录本项目的机器可读契约及其维护规则，避免协议与实现脱节。

## 契约资产
- 说明文档（中文）：[APP_SERVER_DOCUMENTATION.zh-CN.md](./APP_SERVER_DOCUMENTATION.zh-CN.md)
- Web Local 私有 RPC：[WEB_LOCAL_PRIVATE_RPC.zh-CN.md](./WEB_LOCAL_PRIVATE_RPC.zh-CN.md)
- schema 产物目录：`documentation/app-server-schemas/`
  - JSON: `documentation/app-server-schemas/json/`
  - TypeScript: `documentation/app-server-schemas/typescript/`

## 为什么保留 `documentation/app-server-schemas`
- `src/api/appServerDtos.ts` 直接从该目录导入 TypeScript 类型。
- 该目录同时作为协议索引文档的链接目标。
- 若直接迁移目录，会影响构建路径与文档链接。

## 何时需要重生成
出现以下情况时，应重新从 upstream 协议生成 schema 并回填该目录：
- 上游 app-server 方法/事件发生新增或变更
- 需要同步新的 experimental 字段
- TypeScript 类型与运行时协议出现不一致

## 生成与落盘规则
- 生成来源：`openai/codex` app-server protocol codegen
- 落盘目录保持为 `documentation/app-server-schemas/`
- 如未来确需迁移，必须同时更新：
  - `src/api/appServerDtos.ts` 导入路径
  - `docs/contracts/` 中所有文档链接
  - 任何脚本里的输出路径

## 一致性校验流程
当协议字段、事件或方法发生变化时，至少完成以下同步：
1. 更新本目录说明与索引文档。
2. 校验 `src/api/appServerDtos.ts` 的类型引用是否仍然匹配。
3. 若涉及路径变化，全文搜索并修复旧路径引用。
4. 执行 `npm run build`，确保契约变更未破坏构建。

## 私有扩展说明

- `codex-web-local` 可在 bridge 层实现私有 RPC 扩展。
- 私有 RPC 应记录在本目录，但不得误写入 `documentation/app-server-schemas/`。
- 只有当私有能力准备上游化时，才需要进入正式 schema 流程。

## Bridge 私有 HTTP 约定（账号中心）

- 账号档案（profile）管理接口：
  - `GET /codex-api/account-profiles`
  - `POST /codex-api/account-profiles`
  - `POST /codex-api/account-profiles/switch`
- 2026-04-12 起，手机端 ChatGPT 直登 relay 接口已移除（不再提供 `/api/auth/chatgpt/mobile/*` 与 `/auth/chatgpt/callback`）。
