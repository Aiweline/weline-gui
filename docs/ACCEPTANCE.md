# 运行验收记录

验收日期：2026-08-29  
验收宿主：macOS arm64  
框架目录：`/Users/weline/Project/Official/框架`

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
