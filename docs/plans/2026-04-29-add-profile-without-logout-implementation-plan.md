# 新增档案免 logout（隔离登录）Implementation Plan

## Goal
在不执行 `account/logout` 的前提下，允许账号中心“邮箱登录新增档案”成功新增账号档案，避免 `External auth is active` 报错阻断流程。

## Scope
- 仅处理 `account/login/start(type=chatgpt)` 命中 external auth 错误时的兜底。
- 保持现有“切换账号”“当前运行时账号”逻辑不变。
- 不修改 `documentation/app-server-schemas/`。

## Design
1. 当 `account/login/start(type=chatgpt)` 失败且错误为 external auth active：
   - 启动隔离 `codex app-server`（独立临时 `CODEX_HOME`）。
   - 在隔离进程中执行 `initialize` + `account/login/start(type=chatgpt)`，返回 `authUrl` 给前端。
2. 用户完成浏览器登录后，隔离进程接收 `account/login/completed(success=true)` 通知：
   - 读取临时 `auth.json` token。
   - 解析账号信息并写入 `account-profiles.json`（`upsertAccountProfile`）。
   - 清理隔离进程与临时目录。
3. 前端保持现有轮询刷新逻辑，自动看到新增档案。

## Files
- Modify: `src/server/codexAppServerBridge.ts`
- Modify: `tests/codexAppServerBridge.test.mjs`
- Modify: `tests/accountPrivateRpc.test.mjs`

## Validation
1. `node --test tests/codexAppServerBridge.test.mjs`
2. `node --test tests/accountPrivateRpc.test.mjs tests/accountStateModel.test.mjs tests/accountSwitcherUi.test.mjs`
3. `npm run build`
