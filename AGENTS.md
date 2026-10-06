# Weline Control Center（框架 GUI）— Agent 入口

本仓库与「框架」同级、独立 Git。改本仓代码前先读下列硬约束，避免桌面 / Web 再次分叉接口。

## 硬约束（必读）

**[docs/AGENT_HTTP_UNIFIED.md](docs/AGENT_HTTP_UNIFIED.md)** — 桌面 Tauri、Vite Web、`weline-agent` 的**全部业务 I/O**必须统一走：

`AgentTransport` → `/api/v1/*` → `AgentService`（`http.rs`）

禁止：

- 前端业务 `invoke(...)`（除引导注入 endpoint）
- Vite / Node 平行业务实现（含本机项目扫描）
- 「桌面一套、浏览器一套」的临时修复

架构总览：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
安全边界：[docs/SECURITY.md](docs/SECURITY.md)  
验收门禁：[docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)（含传输统一检查项）

## 本地入口（摘要）

```bash
npm ci
npm run tauri dev          # 内嵌 127.0.0.1:17640
# 或纯浏览器：
npm run agent              # 另开终端
npm run dev:web            # Vite 代理 /api → Agent
```

新能力：先加 `AgentService` + `http.rs` 路由，再给 `AgentTransport` 加 HTTP 方法；不要新增第二通道。

桌面壳层：内嵌页可用菜单 **View → Reload Page**（`Cmd/Ctrl+R` / `F5`）或顶栏「刷新页面」；这只重载 WebView，不重启进程，也不走 Agent 业务通道。
