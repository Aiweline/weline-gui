#!/usr/bin/env bash
# One-shot desktop release: align versions → tag → push → GitHub Actions packs all platforms.
# Do NOT manually tauri-build each OS for production releases.
set -euo pipefail

version="${1:-}"
if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.]+)?$ ]]; then
  echo "Usage: $0 <semver>   e.g. $0 0.2.0" >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${root}"

tag="v${version}"

if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "Tag already exists: ${tag}" >&2
  exit 3
fi

if ! git remote get-url github >/dev/null 2>&1; then
  echo "Missing git remote 'github' (needed to trigger Actions)." >&2
  echo "Add with: git remote add github https://github.com/Aiweline/weline-gui.git" >&2
  exit 4
fi

python3 - "${version}" <<'PY'
import json, re, sys
from pathlib import Path

version = sys.argv[1]
root = Path.cwd()

pkg = root / "package.json"
data = json.loads(pkg.read_text())
data["version"] = version
pkg.write_text(json.dumps(data, indent=2) + "\n")

cargo = root / "src-tauri" / "Cargo.toml"
text = cargo.read_text()
text2, n = re.subn(
    r'(?m)^version\s*=\s*"[^"]*"',
    f'version = "{version}"',
    text,
    count=1,
)
if n != 1:
    raise SystemExit("failed to patch Cargo.toml version")
cargo.write_text(text2)

conf = root / "src-tauri" / "tauri.conf.json"
cfg = json.loads(conf.read_text())
cfg["version"] = version
conf.write_text(json.dumps(cfg, indent=2) + "\n")
print(f"aligned version -> {version}")
PY

git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
if ! git diff --cached --quiet; then
  git commit -m "chore: release ${tag}"
fi

git tag -a "${tag}" -m "Weline Control Center ${tag}"
git push origin HEAD
git push github HEAD
git push origin "${tag}"
git push github "${tag}"

echo
echo "Tagged ${tag}. Multi-platform packages are building on GitHub Actions."
echo "  https://github.com/Aiweline/weline-gui/actions/workflows/release.yml"
echo "Do not manually package per OS — wait for the pipeline Release assets."
