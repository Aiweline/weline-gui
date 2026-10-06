#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
framework_root="${1:-$(cd "${project_root}/../框架" 2>/dev/null && pwd -P || true)}"

if [[ -z "${framework_root}" || ! -f "${framework_root}/bin/w" ]]; then
  echo "Usage: $0 /absolute/path/to/Weline" >&2
  exit 2
fi

for command_name in npm cargo systemctl install; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 3
  fi
done

bin_dir="${XDG_BIN_HOME:-${HOME}/.local/bin}"
data_dir="${XDG_DATA_HOME:-${HOME}/.local/share}/weline-gui"
config_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/weline-gui"
unit_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/systemd/user"

cd "${project_root}"
npm ci
npm run build
cargo build --release --manifest-path src-tauri/Cargo.toml --bin weline-agent

install -d "${bin_dir}" "${data_dir}/dist" "${config_dir}" "${unit_dir}"
install -m 0755 src-tauri/target/release/weline-agent "${bin_dir}/weline-agent"
cp -R dist/. "${data_dir}/dist/"
install -m 0644 packaging/systemd/weline-gui-agent.service "${unit_dir}/weline-gui-agent.service"

escaped_framework=${framework_root//\\/\\\\}
escaped_framework=${escaped_framework//\"/\\\"}
printf 'WELINE_FRAMEWORK_ROOT="%s"\nWELINE_PHP_BINARY="php"\n' "${escaped_framework}" > "${config_dir}/agent.env"
chmod 0600 "${config_dir}/agent.env"

"${bin_dir}/weline-agent" token >/dev/null
systemctl --user daemon-reload
systemctl --user enable --now weline-gui-agent.service

echo "Weline GUI: http://127.0.0.1:17640"
echo "Access token: $("${bin_dir}/weline-agent" token)"
echo "Service status: systemctl --user status weline-gui-agent.service"
