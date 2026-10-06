# 构建与发布

## 正式发布（唯一路径）

**桌面多端安装包必须走 GitHub Actions 流水线一次性产出。**  
禁止智能体 / 人工在本机逐平台 `tauri build` 再手工上传。

```text
对齐三处 version → 打 v* 标签并 push → Actions 矩阵同时打 macOS / Windows / Linux
→ 自动挂到 GitHub Release →（可选）同步 Gitee Release
```

### 一键打标签（推荐）

在 GUI 仓库根目录：

```bash
./scripts/release.sh 0.2.0
```

脚本会：

1. 把 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的 `version` 对齐  
2. 提交 version bump（若有变更）  
3. 打 `v0.2.0` 并 push 到 `origin`（Gitee）与 `github`（触发流水线）

然后打开 Actions 等待矩阵完成：

- [GitHub Actions · Release desktop apps](https://github.com/Aiweline/weline-gui/actions/workflows/release.yml)

产物自动出现在：

- [GitHub Releases](https://github.com/Aiweline/weline-gui/releases)
- Gitee Releases（若仓库 Secrets 配置了 `GITEE_ACCESS_TOKEN`，流水线会同步附件）

也可只打标签（版本已对齐时）：

```bash
git tag v0.2.0
git push origin v0.2.0
git push github v0.2.0
```

或对已有标签重建：

```bash
gh workflow run "Release desktop apps" --repo Aiweline/weline-gui -f tag=v0.2.0
```

### 流水线矩阵

| Runner | 安装包 |
| --- | --- |
| `macos-14` | `.dmg` + `.app` |
| `ubuntu-22.04` | `.deb` + `.AppImage` |
| `windows-latest` | NSIS `.exe` Setup |

工作流：`.github/workflows/release.yml`（`push` 匹配 `v*`，或 `workflow_dispatch`）。

### Agent / 协作者禁令

| 允许 | 禁止 |
| --- | --- |
| `./scripts/release.sh <ver>` 或 push `v*` 标签 | 本机交叉编译 Windows / Linux 安装包 |
| 等 Actions 出包后核对 Release 页 | 逐平台 `npm run tauri build` 再手工 `attach_files` |
| 本地 `tauri build` **仅本机调试** | 把未签名草稿包当正式发布交付 |

### Secrets（GitHub 仓库）

| Secret | 用途 |
| --- | --- |
| `GITHUB_TOKEN` | 默认可用，写 Release |
| `TAURI_SIGNING_PRIVATE_KEY` | 可选；有则生成 updater 签名产物 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 可选 |
| `GITEE_ACCESS_TOKEN` | 可选；有则把安装包同步到 Gitee 同名 Release |

操作系统商店 / Apple 公证另配平台证书，不得提交进 Git。

## 版本规则

以下必须一致：

- `package.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `version`
- `src-tauri/tauri.conf.json` 的 `version`
- Git 标签，例如 `v0.2.0`

客户端读 GitHub `releases/latest`（忽略 draft / prerelease），用 SemVer 与安装版本比较。

## 本地调试构建（非发布）

仅验证当前宿主能否编过：

```bash
npm ci
npm run check
npm run tauri build
```

这只产出**当前 OS** 包，**不算正式多端发布**。

## iOS / Android

移动端仍需各自签名环境，不混进桌面流水线：

```bash
npm run tauri ios build
npm run tauri android build
```

默认远程宿主模式，不在设备上跑 PHP。
