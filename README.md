# Weline Control Center（框架 GUI）

Weline Control Center 是 Weline/WLS 的独立跨平台控制中心。它与框架目录同级、拥有自己的 Git 仓库，桌面端可直接管理本机 WLS，iOS/Android 与浏览器通过宿主代理远程管理服务器。

当前版本：`0.1.0`（可运行 MVP）。

## 可行性结论

| 平台 | 使用方式 | 本机启动 WLS | 状态 |
| --- | --- | ---: | --- |
| Windows | Tauri 桌面应用 | 是 | 源码与打包流水线已配置 |
| macOS | Tauri 桌面应用 | 是 | 已在 Apple Silicon 主机编译验证 |
| Linux（有桌面） | Tauri 桌面应用 | 是 | 源码与打包流水线已配置 |
| Linux（无桌面） | `weline-agent` + 响应式 Web UI | 是 | 已实际运行验证 |
| iOS / iPadOS | Tauri 移动客户端 | 否，远程连接宿主 | 工程支持；发布需要 Xcode 与 Apple 签名 |
| Android | Tauri 移动客户端 | 否，远程连接宿主 | 工程支持；发布需要 JDK/Android SDK 与签名 |

手机操作系统的沙箱不能承载 PHP/WLS 服务，因此移动端是完整的远程控制客户端，不是在手机上伪造“本机启动”。服务器端仍由同一套 Rust 代理执行框架命令并采集指标。

## 已实现

- 首次安装向导与运行时语言切换：English、简体中文、Español、हिन्दी、العربية、Português (Brasil)、Français、Deutsch、日本語、한국어；阿拉伯语自动切换 RTL。
- 一键启动、停止、重启、热重载 WLS 实例，数据来自 `server:list --json`。
- CPU、内存、Swap、磁盘、网络、负载、宿主运行时间及 WLS 进程树监控。
- 网站域名与真实 TLS 证书探测：自动合并 WLS 已启用域名与显式网站 URL，并显示主题、签发者、有效期、剩余天数、SHA-256 指纹及主机名匹配状态；可删除托管证书，若仍被站点引用会要求二次确认。
- 受限命令控制台：仅允许参数化 `php bin/w …`，不经过 Shell。
- 内嵌 WLS 管理面板；目标站点禁止 iframe 时可一键新窗口打开。
- 启动后自动检查 GitHub 最新正式 Release，并按语义版本判断是否存在新版本。
- 同一套前端适配 375、768、1024 及更宽视口。
- 无桌面 Linux 的 Bearer Token API 与静态 Web 服务；非回环监听强制要求 TLS。

## 本地开发

要求 Node.js 22+、Rust 1.95+、PHP，以及可运行的 Weline 框架。

```bash
npm ci
npm run check
npm run tauri dev
```

**硬约束**：桌面 / Vite Web / `weline-agent` 的业务 I/O **必须统一**走 Agent HTTP（`/api/v1/*` → `AgentService`）。禁止再为 Web 另写 Node 扫描，或为桌面另写业务 `invoke`。详见 [docs/AGENT_HTTP_UNIFIED.md](docs/AGENT_HTTP_UNIFIED.md)。

`tauri dev` 会在进程内嵌 `127.0.0.1:17640`；纯浏览器调试时另开终端 `npm run agent`，再 `npm run dev:web`（Vite 将 `/api` 代理到同一 Agent）。

首次启动时选择语言，桌面端选择“管理本机”。本机模式经 `GET /api/v1/projects/scan` 扫描已启动和附近的 Weline 项目，默认选中当前正在运行的项目；也可以自定义新增。线上/远程模式才需要填写宿主代理地址和令牌。

## 无桌面 Linux

在源码目录执行：

```bash
./scripts/install-headless-linux.sh /absolute/path/to/Weline
```

脚本构建前端和 Rust 代理、安装用户级 systemd 服务并输出随机访问令牌。默认只监听 `127.0.0.1:17640`，可通过本机浏览器或 SSH 端口转发访问：

```text
http://127.0.0.1:17640
```

查看或轮换令牌：

```bash
weline-agent token
weline-agent token --rotate
```

需要直接暴露给局域网/公网时，必须同时传入 `--tls-cert` 和 `--tls-key`，并只开放给可信网络。更推荐由现有 HTTPS 反向代理转发到回环地址。

## 更新策略

设置中填写 `owner/repository` 后，客户端启动时自动读取 GitHub `releases/latest`。只有已发布、非 draft、非 prerelease 且语义版本高于当前版本的 Release 才显示更新。

检测与安装信任是两件事：当前界面提供版本判断、发布说明与 Release 入口；可安装桌面包必须由发布流水线签名。没有签名的 GitHub 资源不会被静默执行。详见 [发布说明](docs/RELEASE.md)。

## 文档

- **[硬约束：统一 Agent HTTP](docs/AGENT_HTTP_UNIFIED.md)**（改接口前必读）
- [架构与数据流](docs/ARCHITECTURE.md)
- [安全模型](docs/SECURITY.md)
- [构建与发布](docs/RELEASE.md)
- [运行验收记录](docs/ACCEPTANCE.md)
- [Agent 入口](AGENTS.md)

## 常用命令

```bash
npm run test          # 多语言契约测试
npm run build         # Web 生产构建
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --no-bundle
```
