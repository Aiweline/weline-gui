# 硬约束：桌面 / Web 统一 Agent HTTP

**状态：强制（MANDATORY）**  
**权威交叉引用：** [ARCHITECTURE.md](ARCHITECTURE.md) · [README.md](../README.md) · [AGENTS.md](../AGENTS.md)

## 一句话

控制中心前端（Tauri 桌面窗口、Vite `:1420`、无桌面浏览器、移动远程端）的**全部业务 I/O**必须走同一套版本化 REST：`/api/v1/*` → `AgentService`。禁止再按宿主分叉第二套业务通道。

## 允许

| 层 | 允许 |
| --- | --- |
| 前端 | `AgentTransport` 只 `fetch` `/api/v1/...`（含 Vite 代理同源 `/api`） |
| 业务实现 | 仅 `src-tauri` 的 `AgentService` + `http.rs`（桌面内嵌与 `weline-agent serve` 共用） |
| 本机扫描 | 仅 `discover.rs`，经 `GET /api/v1/projects/scan` 暴露 |
| 桌面 IPC | **仅**引导：`get_local_agent_endpoint`（或等价）注入 `agentUrl` + `token` |
| 桌面壳层 | 原生菜单 / 快捷键 **Reload Page**（`Cmd/Ctrl+R`、`F5`）重载内嵌 WebView——**不是**业务 API，禁止借此加业务 `invoke` |
| 本机引导 | `GET /api/v1/local-session`（peer 必须 loopback） |

## 禁止（再出现即回归）

1. 前端为 snapshot / scan / control / console / websites / config / update 等业务再写 `invoke('…')`。
2. 在 Vite / Node 再实现一份「本机项目扫描」或其它业务逻辑（已删除的 `local-project-scan.mjs` / `vite-local-scan-plugin` 不得复活）。
3. 桌面一条实现、Web 另一条实现（例如桌面 IPC 扫描、浏览器另写发现）。
4. 用 SPA HTML / 非 JSON 冒充 `/api/v1/*` 成功响应。
5. 非回环监听时放宽为无 Bearer / 无 TLS。

## 宿主如何到达同一 API

| 宿主 | 路径 |
| --- | --- |
| 桌面 Tauri | 进程内嵌 `http::serve`（默认 `127.0.0.1:17640`） |
| Vite 开发 | `vite.config` 将 `/api` 代理到上述 Agent |
| `weline-agent` | 同一 `http::serve`，可托管 `dist` |
| 远程 / 移动 | Bearer +（非回环）TLS，仍只打 `/api/v1/*` |

## 改代码时的自检清单

- [ ] 新能力是否先加在 `AgentService`，再暴露 `http.rs` 路由？
- [ ] 前端是否只增加 `AgentTransport` 的 HTTP 方法、无新业务 `invoke`？
- [ ] 桌面与浏览器是否用同一路径验收（curl Bearer + UI）？
- [ ] 是否避免新增 Node/Python「平行业务实现」？

## 历史坑（勿重复）

曾出现浏览器本机打 Vite 同源却无 API → 拿到 HTML → `next.find is not a function` / 「已找到 691 个项目」。根因是传输分叉，不是 UI。统一 HTTP 后禁止再引入平行扫描层「临时修好 Web」。
