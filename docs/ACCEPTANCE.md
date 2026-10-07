# 运行验收记录

验收日期：2026-08-29  
验收宿主：macOS arm64  
框架目录：`/Users/weline/Project/Official/框架`

## 传输统一（硬门禁）

桌面与浏览器本机模式必须走同一套 Agent HTTP，不得分叉业务通道。权威：[AGENT_HTTP_UNIFIED.md](AGENT_HTTP_UNIFIED.md)。

验收时至少核对：

- [ ] `curl -sS http://127.0.0.1:17640/api/v1/health` 返回 JSON（非 SPA HTML）。
- [ ] 受保护接口带 Bearer：`GET /api/v1/projects/scan` 返回 `projects` 数组；响应不得为 HTML。
- [ ] Vite `:1420` 同源 `/api/v1/...` 与桌面内嵌 Agent 行为一致（代理到同一 `AgentService`）。
- [ ] 前端无业务 `invoke`；仅允许引导级 `get_local_agent_endpoint`（若存在）。
- [ ] 仓库无复活的 Node「本机扫描」平行实现（如已删除的 `local-project-scan.mjs` / Vite scan plugin）。
- [ ] 回环 Web：agent 已 `configured` 时清空 `localStorage` 后刷新，直进总览（不走 SetupWizard）。
- [ ] 回环 Web：agent 不可达时显示 OfflineGate，而不是「选择宿主」向导。
- [ ] 网站 → 新建网站：主地址可搜索过滤域名池并点选创建。
- [x] 命令控制台：`GET /api/v1/console/commands` 返回分组树（本机 333/112）；左侧可搜索/展开；单击填入、双击执行；仍拒绝 Shell 运算符（2026-10-07 Web）。
- [x] 项目作用域：Host Profile 绑定 `frameworkRoot`；切换主机时先 `PUT /api/v1/config` 激活对应项目，再刷 snapshot/命令树/网站（同 Agent 多项目不再串台）。
- [x] 顶栏/设置语言切换：可搜索自定义菜单（非原生 `<select>`）；10 语种；中文标题为「Weline 控制中心」；切换即 `applyLocale` 并写回 Agent `config.language`。

## 多机运维中枢（2026-10-06 Web 真机）

验收 Host：`http://127.0.0.1:1420/`（Vite → Agent `127.0.0.1:17640`；桌面嵌入同一 Web）。

- [x] 顶栏 Host Profile 切换器（可搜索自定义菜单，非原生 `<select>`）；设置可「添加远程主机」（Local + 远程 2）。
- [x] 多机总览：本机卡片显示 CPU/内存/在线实例（真机拉 `/api/v1/snapshot`）。
- [x] SSH 终端页：密钥表单 + session-only 提示；连接按钮在缺字段时禁用。
- [x] `WS /api/v1/ssh/session`：坏 token → HTTP 401；有效 token 可升级 WebSocket。
- [x] Framework API SDK 设置区：站点根 / 用户 / 密码 / 登录路径（默认 `/api/api/rest/v1/auth/login`）。
- [x] Vitest 28 passed；`cargo check --bin weline-agent` 通过。

## 自动化验证

- React/Vitest：10 种语言、阿拉伯语 RTL、中文证书提示等契约通过。
- TypeScript 与 Vite 生产构建通过。
- Rust 单元/集成测试通过，覆盖 SemVer、无 Shell 控制台、配置归一化、WLS 域名解析、停止实例 PID 清理与证书域名匹配。
- Tauri macOS debug 应用完成真实编译。
- npm 依赖审计未发现已知漏洞。

## 实际运行结果

- `weline-agent` 已在回环地址启动，健康检查、Bearer Token 鉴权、配置读写及完整快照均通过。
- 真实执行 `php bin/w server:list --json` 成功；包含 `; id` 的注入输入在进程启动前被拒绝，证明控制台未进入 Shell。
- 当前宿主上的外部 `default` WLS 实例可被识别和监控，没有由本次验收停止或重启。
- 从 WLS 证书清单自动发现 `p05113ef3.weline.test`；实际握手观察到回退证书 `unconfigured.wls.invalid`，域名不匹配会在界面标为“需要处理”。
- 尝试以隔离实例验证完整启动链时，WLS 本身返回 `Managed-child Master lease heartbeat is stale`；测试实例均已停止且端口关闭，现有默认实例未受影响。这是当前宿主 WLS 租约状态的外部阻塞，不以模拟成功替代。

## 响应式证据

- [375 px 手机视口](evidence/dashboard-375.png)
- [768 px 平板视口](evidence/dashboard-768.png)
- [1024 px 桌面视口](evidence/dashboard-1024.png)
- [1024 px 真实域名与证书状态](evidence/certificates-1024.png)
- [375 px 移动端证书状态](evidence/certificates-375.png)

三个视口均完成浏览器实际渲染检查，无横向溢出；桌面、折叠侧栏与移动底部导航按断点切换。

## 尚需发布环境完成

- iOS 需要完整 Xcode、CocoaPods、Apple Developer 签名与 provisioning profile。
- Android 需要 JDK、Android SDK/NDK、Rust Android targets 与签名 keystore。
- Windows/Linux 桌面安装包由对应 GitHub Actions 原生 runner 构建；正式分发前需配置 Tauri 签名密钥和各平台签名凭据。
