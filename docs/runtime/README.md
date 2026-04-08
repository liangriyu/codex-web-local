# Runtime 文档

## 本页职责
记录运行相关的事实信息：如何启动、如何调试、参数变化后需要同步哪些文档。

## 适用内容
- 本地启动、开发调试、守护进程运行
- 网络访问方式（LAN、Tailscale）
- 常见运行故障排查

## 先看顺序
1. [agent-handoff.md](./agent-handoff.md)（代理接手 SOP）
2. 根目录 `README.md`（安装与基础命令）
3. 根目录 `README.zh-CN.md`（中文说明）

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

- `Chrome / Edge 桌面` 与 `Android Chrome` 默认优先使用浏览器原生语音识别。
- `iPhone Chrome` 默认依赖录音回退路径，因此需要：
  - 使用 `HTTPS` 访问当前服务
  - 配置本机离线 STT，可通过 `--stt-command` 与 `--stt-model` 启用
- 若只配置了浏览器原生识别能力而未配置本机 STT，则 iPhone Chrome 无法获得稳定语音输入体验。

## 语音输入相关 CLI 参数

- `--https-cert <path>`
- `--https-key <path>`
- `--stt-command <path>`
- `--stt-model <path>`
- `--stt-language <code>`
- `--stt-timeout-ms <ms>`

## 局域网与 iPhone 使用建议

- 需要在局域网内让 iPhone 浏览器使用语音输入时，优先通过 `https://<局域网地址>:<端口>` 访问。
- 如果证书是自签发或本地 CA 颁发，需要在 iPhone 上安装并信任对应证书。
- `http://局域网IP` 仍可访问普通 Web UI，但不能作为 iPhone 录音回退的可靠方案。
