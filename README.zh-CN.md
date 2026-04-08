语言：简体中文 | [English](./README.md)

# `npx @leibnizhu/codex-web-local`

一个轻量的 [Codex](https://github.com/openai/codex) Web 界面，复刻桌面端交互体验，并运行在 Codex `app-server` 之上。它把本地 Codex 通过 Web 应用暴露出来，让你可以在任意浏览器里远程访问本地 Codex 实例。

## 前置要求

- 已安装 [Codex CLI](https://github.com/openai/codex)，并且可在 `PATH` 中访问

## 安装

```bash
# 直接用 npx 运行（无需安装）
npx @leibnizhu/codex-web-local

# 或全局安装
npm install -g @leibnizhu/codex-web-local
```

## 用法

```
Usage: codex-web-local [options]

Web interface for Codex app-server

Options:
  -p, --port <port>    监听端口（默认: "3000"）
  --host <host>        监听地址（例如: 127.0.0.1 / 0.0.0.0 / 100.x.x.x）
  -d, --daemon         后台运行（守护进程模式）
  --password <pass>    设置固定访问密码
  --no-password        关闭密码保护
  --https-cert <path>  HTTPS 证书路径（PEM）
  --https-key <path>   HTTPS 私钥路径（PEM）
  --stt-command <path> 本地语音转写可执行文件路径
  --stt-model <path>   本地语音转写模型路径
  --stt-language <code> 默认语音转写语言代码
  --stt-timeout-ms <ms> 本地语音转写超时时间（毫秒）
  -h, --help           显示帮助
```

## 示例

### 正式命令（生产/日常使用）

```bash
# 默认 3000 端口启动，并自动生成访问密码
codex-web-local

# 指定端口启动
codex-web-local --port 8080

# 指定访问密码启动
codex-web-local --password my-secret

# 关闭密码保护（仅建议在可信网络中使用）
codex-web-local --no-password

# 后台启动（守护进程模式）
codex-web-local --daemon

# 指定监听地址（例如监听所有网卡）
codex-web-local --host 0.0.0.0

# Tailscale 场景 + 后台运行
codex-web-local --host "$(tailscale ip -4)" --port 3000 --daemon

# 启用 HTTPS 与本地离线语音转写
codex-web-local \
  --host 0.0.0.0 \
  --port 3443 \
  --https-cert ./certs/dev.pem \
  --https-key ./certs/dev-key.pem \
  --stt-command /usr/local/bin/whisper-cli \
  --stt-model ./models/ggml-base.bin
```

### 开发命令（Vite）

```bash
# 开发模式，监听局域网
npm run dev -- --host 0.0.0.0

# 开发模式，绑定到当前机器的 Tailscale IPv4
npm run dev -- --host "$(tailscale ip -4)"

# 开发模式后台运行
npm run dev -- --host 0.0.0.0 --daemon
```

默认开启密码保护时，服务会在控制台打印密码。浏览器打开 URL 后输入密码即可访问。

## 界面与交互更新

- 输入框底部状态区新增：
  - 当前 git 分支
  - context window 用量圆环（hover 显示详细信息）
  - 剩余额度悬浮卡片
- 输入器已支持语音输入：
  - `Chrome / Edge 桌面` 与 `Android Chrome` 优先走浏览器原生识别
  - `iPhone Chrome` 在启用 HTTPS 且配置本地离线 STT 时走录音回退
  - 转写文本只会回填到输入框，不会自动发送
- context 悬浮卡片支持手动“立即压缩”（调用 `thread/compact/start`）。
- 左侧线程列表以 `name` 作为主标题，`preview` 通过 tooltip 展示，不再在 hover 时行内展开。
- AI 响应期间仍可继续输入；点击发送后会进入等待队列，当前轮结束后自动发送。

## 语音输入说明

- 语音功能不会修改线程消息协议，只会把识别结果写回输入框草稿。
- `iPhone Chrome` 的录音回退依赖 `HTTPS`；仅使用 `http://局域网IP` 无法可靠获取麦克风权限。
- 对 `Chrome / Edge 桌面` 和 `Android Chrome`，本地离线 STT 是可选增强；但对 `iPhone Chrome` 的回退路径，它是必需前提。
- 当前实现按 `whisper.cpp` 这一类本地可执行程序接入，通过 `--stt-command` 与 `--stt-model` 配置。

## 守护进程说明

- `codex-web-local --daemon` 会让 CLI 服务在后台运行，并打印 `PID`。
- `npm run dev -- --daemon` 会让 Vite 开发服务在后台运行，并打印 `PID`。
- 停止后台进程：

```bash
kill <PID>
```

## 文档导航

- 文档总入口：[docs/README.md](./docs/README.md)
- 契约说明：[docs/contracts/README.md](./docs/contracts/README.md)
- app-server 中文文档：[docs/contracts/APP_SERVER_DOCUMENTATION.zh-CN.md](./docs/contracts/APP_SERVER_DOCUMENTATION.zh-CN.md)

## 贡献

欢迎提交 issue 和 PR。如果你有想法、建议或发现了 bug，欢迎在 [GitHub 仓库](https://github.com/Leibnizhu/codex-web-local/issues) 提交反馈。

## 许可证

[MIT](./LICENSE)
