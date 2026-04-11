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
- 启动方式（开发/生产）
- 运行前置条件或依赖

## 最低同步要求
- 运行相关变更至少同步更新：
  - 根目录 `README.md`
  - 根目录 `README.zh-CN.md`
  - 本目录文档
- 交付前至少完成一次构建验证：`npm run build`

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
