# Cloudflare Tunnel 排障

## 适用场景
- 本地 `3000` 端口服务可访问，但 `codex.landycode.online` 无法访问。
- Cloudflare Tunnel 域名偶发返回 `530`、页面卡住，或长时间无法建立连接。
- `cloudflared` 日志出现 `timeout`、`Lost connection with the edge`、`does not have any active connection`。

## 本项目当前稳定形态
- Web 服务运行在 `http://127.0.0.1:3000`
- 只保留一条系统级 `cloudflared` daemon
- `cloudflared` 以 `http2` 协议运行，不再使用默认的 `quic`
- Cloudflare Public Hostname 指向 `codex.landycode.online -> http://127.0.0.1:3000`

## 本次排障结论
- 如果本地 `3000` 正常，但域名仍不可访问，优先看 Tunnel 是否存在 active connection。
- `530` 在本次案例里不是应用层错误，而是 Cloudflare Edge 当时没有可用的 Tunnel 连接可转发。
- 最终根因是当前网络环境到 Cloudflare Edge `7844` 端口的出站链路不稳定。
- 切换到手机热点后，Tunnel 重新注册连接，域名恢复 `HTTP/2 200`。

## 快速检查顺序
1. 确认本地服务正常：

```bash
curl -I http://127.0.0.1:3000
```

2. 确认系统 daemon 正在运行：

```bash
ps aux | rg "cloudflared tunnel run"
```

3. 确认 Tunnel 就绪状态：

```bash
curl -I http://127.0.0.1:20241/ready
```

4. 确认 Tunnel 是否仍有 active connection：

```bash
cloudflared tunnel info 5a6e37d6-fbc4-4722-96b2-28f40ff319a6
```

5. 查看系统日志是否出现 Edge 连通性错误：

```bash
tail -n 80 /Library/Logs/com.cloudflare.cloudflared.err.log
```

6. 最后再验证外网入口：

```bash
curl -k -I https://codex.landycode.online
```

## 关键判定

### 情况一：本地 `3000` 正常，`/ready` 返回 `503`
- 说明 `cloudflared` 进程存在，但当前没有健康的 Edge 连接。
- 继续看 `cloudflared tunnel info` 和日志。

### 情况二：`cloudflared tunnel info` 显示 `does not have any active connection`
- 说明 Cloudflare 已知道这条 Tunnel，但当前没有可用 connector。
- 这时域名很容易出现 `530`。

### 情况三：日志出现以下报错

```text
DialContext error: dial tcp 198.41.x.x:7844: i/o timeout
Lost connection with the edge
```

- 优先判断为本机、防火墙、路由器、公司网络或运营商网络对 Cloudflare Edge `7844` 出站链路有限制或严重抖动。
- 先换手机热点或别的网络做 A/B 对照，不要先改应用代码。

## 当前 system daemon 配置
- 启动文件：`/Library/LaunchDaemons/com.cloudflare.cloudflared.plist`
- 当前关键参数：

```text
cloudflared tunnel run --token <token> --protocol http2
```

## 为什么固定 `http2`
- 在本机环境里，`quic` 日志持续出现 `timeout: no recent network activity`。
- 切到 `http2` 后，Tunnel 可以正常注册连接，问题收敛到网络出口是否能稳定访问 Cloudflare Edge。
- 如果仍然无法稳定保持 active connection，优先检查网络，不要反复切换本地服务端口。

## 建议的长期做法
- Web 服务固定使用 `3000`
- 只保留一条系统级 `cloudflared`
- 优先使用 `http2`
- 如果原网络不稳定，优先排查出站 `7844`，或将 Tunnel 放到网络更稳定的机器上运行
