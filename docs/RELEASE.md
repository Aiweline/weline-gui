# 构建与发布

## 桌面端

```bash
npm ci
npm run check
npm run tauri build
```

Tauri 会按当前宿主生成平台安装包。正式发布由 `.github/workflows/release.yml` 在 `v*` 标签触发，矩阵构建 macOS、Windows 和 Linux 资源，并创建 GitHub Release。

仓库需要配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

操作系统商店/公证还需要各平台自己的代码签名凭据。签名私钥不得提交到仓库。

## 版本规则

以下版本必须保持一致：

- `package.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `version`
- `src-tauri/tauri.conf.json` 的 `version`
- Git 标签，例如 `v0.2.0`

客户端请求 `https://api.github.com/repos/<owner>/<repo>/releases/latest`，忽略 draft/prerelease，并用 SemVer 比较 tag 与安装版本。

## iOS

需要完整 Xcode、CocoaPods、Apple Developer 签名与 provisioning profile：

```bash
npm run tauri ios init
npm run tauri ios build
```

移动端默认进入“远程宿主”模式，不在设备上执行 PHP。

## Android

需要 JDK、Android SDK/NDK、Android Rust targets 与签名 keystore：

```bash
npm run tauri android init
npm run tauri android build
```

CI 目前只自动发布桌面包；移动商店发布应在对应签名环境中单独开启，避免把平台密钥混入桌面流水线。

