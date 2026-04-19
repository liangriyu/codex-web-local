# Runtime 文档

## 本页职责
记录运行相关的事实信息：如何启动、如何调试、参数变化后需要同步哪些文档。

## 适用内容
- 本地启动、开发调试、守护进程运行
- 网络访问方式（LAN、Tailscale）
- 常见运行故障排查
- Cloudflare Tunnel 域名访问异常排查

## 先看顺序
1. [agent-handoff.md](./agent-handoff.md)（代理接手 SOP）
2. 根目录 `README.md`（安装与基础命令）
3. 根目录 `README.zh-CN.md`（中文说明）
4. [cloudflare-tunnel-troubleshooting.md](./cloudflare-tunnel-troubleshooting.md)（域名代理不稳定、`530`、Edge 连接丢失）

## 更新触发
当以下内容变化时，必须更新本目录文档：
- CLI 参数（`--host`、`--port`、`--daemon`、密码相关）
- 运行模式参数（`--server-mode`）
- 启动方式（开发/生产）
- 运行前置条件或依赖

## 最低同步要求
- 运行相关变更至少同步更新：
  - 根目录 `README.md`
  - 根目录 `README.zh-CN.md`
  - 本目录文档
- 交付前至少完成一次构建验证：`npm run build`

## 账号中心运行说明

- CLI 运行模式分为：
  - `shared`：默认模式，目标是连接已有 `codex app-server`，优先满足账号共享与会话强共享方向。
  - `isolated`：显式独立模式，`codex-web-local` 自己管理运行时，不承诺与桌面 `codex app` 强共享。

- Web 访问密码与底层 OpenAI / Codex 账号是两套独立鉴权：
  - 浏览器首次访问站点时输入的是 `codex-web-local` 自己的访问密码
  - 进入页面后的“账号中心”调用的是 `app-server` 的 `account/*` RPC
- `shared` 模式下，账号中心显示和操作的是共享 `codex app-server` 当前账号，不再把 profile 当作运行态账号源。
- `isolated` 模式下，多账号切换仍来自 `codex-web-local` 自己维护的 profile 层；切换时会同步切换当前 `CODEX_HOME`。
- 当前首版账号中心支持：
  - 查看当前账号状态
  - 电脑端通过 ChatGPT OAuth 登录
  - 电脑端通过 API Key 登录
  - `isolated` 模式下的账号档案（profile）新建与切换
  - 退出登录与重新认证
- 手机端 `<=720px` 会使用全屏 sheet 展示账号中心。
- 手机端在 `shared` 模式下只支持查看状态；在 `isolated` 模式下支持切换已有账号档案，不执行授权登录动作。
- 共享会话当前只有最小 owner 模型：
  - 若会话 owner 在另一端且 turn 正在运行，Web 输入区会进入只读态
  - “接管控制权”目前只是 MVP 壳子，不包含完整 server enforcement

## 语音输入运行说明

- 浏览器原生语音识别仍是主通道。
- 若运行环境不提供原生语音识别，只有服务端显式开启语音 fallback 时，Web UI 才显示录音按钮。
- fallback 通过 `/codex-api/rpc` 下的 `web-local/voice-input/*` 私有 RPC 转到服务端语音 provider，不会修改线程消息协议。
- 当前支持的 provider：
  - `openai`：`gpt-4o-mini-transcribe`
  - `zhipu`：`glm-asr-2512`
- `iPhone` 或局域网浏览器使用录音回退时，仍建议通过 HTTPS 访问。

## 语音输入相关运行配置

- `--https-cert <path>`
- `--https-key <path>`
- `CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER=openai|zhipu`
- OpenAI:
  - `OPENAI_API_KEY`
  - `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1`
- 智谱:
  - `ZHIPU_API_KEY`
  - `CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED=1`

## 局域网与 iPhone 使用建议

- 需要在局域网内让 iPhone 浏览器访问 Web UI 时，优先通过 `https://<局域网地址>:<端口>` 访问。
- 如果证书是自签发或本地 CA 颁发，需要在 iPhone 上安装并信任对应证书。
- `http://局域网IP` 仍可访问普通 Web UI，但不适合作为录音回退的长期方案。
