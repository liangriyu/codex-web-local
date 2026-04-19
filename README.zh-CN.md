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
  --server-mode <mode> 运行模式：shared 或 isolated（默认：shared）
  --https-cert <path>  HTTPS 证书路径（PEM）
  --https-key <path>   HTTPS 私钥路径（PEM）
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

# 共享模式启动（默认，推荐）
codex-web-local --server-mode shared

# 显式退回独立模式
codex-web-local --server-mode isolated

# 指定监听地址（例如监听所有网卡）
codex-web-local --host 0.0.0.0

# Tailscale 场景 + 后台运行
codex-web-local --host "$(tailscale ip -4)" --port 3000 --daemon

# 启用 HTTPS
codex-web-local \
  --host 0.0.0.0 \
  --port 3443 \
  --https-cert ./certs/dev.pem \
  --https-key ./certs/dev-key.pem

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

这里的 Web 访问密码只负责保护 `codex-web-local` 站点入口；界面里的“账号中心”管理的是底层 OpenAI / Codex 账号，两者是两套独立鉴权。

运行模式默认是 `shared`，目标是优先连接已有的 Codex `app-server`，为更强的账号/会话共享打基础；如果你需要让 `codex-web-local` 自己管理运行时，请显式传 `--server-mode isolated`。

## 账号中心：电脑端登录，手机端切换

- 账号中心管理的是当前激活 `app-server` 暴露出来的底层 OpenAI / Codex 账号状态。
- 运行语义取决于 `--server-mode`：
  - `shared`：账号中心直接作用于共享的 `codex app` 运行时，登录/退出都是全局动作。
  - `isolated`：`codex-web-local` 自己管理运行时，可以继续使用本地账号档案（profile）。
- 账号登录动作（ChatGPT OAuth / API Key）仅在电脑端开放。
- 手机端（`<=720px`）在 `shared` 模式下只查看状态；在 `isolated` 模式下仍可切换已有账号档案。
- 账号档案（profile）只属于 `isolated` 模式：
  - 在电脑端新建账号档案并完成登录
  - 在独立模式下从账号中心切换档案
- `shared` 模式下，账号中心不再把 profile 视为当前账号真相。
- Web 访问密码与 OpenAI / Codex 账号登录状态保持独立。

## 界面与交互更新

- 输入框底部状态区新增：
  - 当前 git 分支
  - context window 用量圆环（hover 显示详细信息）
  - 剩余额度悬浮卡片
- 左侧栏和移动端顶部新增一级“账号中心”入口：
  - 查看当前 OpenAI / Codex 账号状态
  - 展示当前运行时是 `shared` 还是 `isolated`
  - 仅在 `isolated` 模式下切换账号档案
  - 在电脑端发起 ChatGPT / API Key 登录
  - 退出登录或重新认证，不影响 Web 访问密码
- 共享会话状态新增最小 owner 模型：
  - 当会话由另一端控制时，输入框进入只读态
  - UI 会展示接管入口壳子，而不是默认允许并发写入
- 输入器已支持语音输入：
  - 浏览器原生语音识别仍是主通道
  - 不支持原生识别时，只有服务端显式开启语音 fallback 才会展示录音入口
  - 转写文本只会回填到输入框，不会自动发送
- context 悬浮卡片支持手动“立即压缩”（调用 `thread/compact/start`）。
- 左侧线程列表以 `name` 作为主标题，`preview` 通过 tooltip 展示，不再在 hover 时行内展开。
- AI 响应期间仍可继续输入；点击发送后会进入等待队列，当前轮结束后自动发送。

## 语音输入说明

- 语音功能不会修改线程消息协议，只会把识别结果写回输入框草稿。
- 当前版本仍未恢复本地离线 STT；回退链路是 `codex-web-local` bridge 私有 RPC 转到服务端语音 provider。
- 当前支持的 provider：
  - `openai`：`gpt-4o-mini-transcribe`
  - `zhipu`：`glm-asr-2512`
- 通过 `CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER=openai|zhipu` 选择当前 provider。
- OpenAI fallback 需要同时设置：
  - `OPENAI_API_KEY`
  - `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1`
- 智谱 fallback 需要同时设置：
  - `ZHIPU_API_KEY`
  - `CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED=1`
- `iPhone` 或局域网浏览器使用录音回退时，仍建议通过 HTTPS 访问。

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
