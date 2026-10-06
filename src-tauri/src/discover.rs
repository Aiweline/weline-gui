use crate::models::DiscoveredProject;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::System;

const MAX_WALK_DEPTH: usize = 10;
const MAX_DIRECTORY_SCAN: usize = 48;

pub fn preferred_framework_root() -> Option<PathBuf> {
    let projects = scan_local_projects();
    projects
        .iter()
        .find(|project| project.running)
        .or(projects.first())
        .map(|project| project.framework_root.clone())
}

pub fn scan_local_projects() -> Vec<DiscoveredProject> {
    let mut candidates: BTreeMap<String, Candidate> = BTreeMap::new();

    for (root, php) in running_framework_roots() {
        remember(&mut candidates, root, true, php);
    }

    for root in nearby_framework_roots() {
        remember(&mut candidates, root, false, String::from("php"));
    }

    let mut projects = candidates
        .into_values()
        .filter_map(|candidate| {
            inspect_framework_root(&candidate.root, candidate.running, &candidate.php_binary)
        })
        .collect::<Vec<_>>();
    projects.sort_by(|left, right| {
        right
            .running
            .cmp(&left.running)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    projects
}

fn remember(
    candidates: &mut BTreeMap<String, Candidate>,
    root: PathBuf,
    running: bool,
    php_binary: String,
) {
    let key = canonical_key(&root);
    let entry = candidates.entry(key).or_insert(Candidate {
        root,
        running: false,
        php_binary: String::from("php"),
    });
    entry.running |= running;
    if running && php_binary != "php" {
        entry.php_binary = php_binary;
    }
}

struct Candidate {
    root: PathBuf,
    running: bool,
    php_binary: String,
}

fn running_framework_roots() -> Vec<(PathBuf, String)> {
    let mut system = System::new_all();
    system.refresh_all();
    system
        .processes()
        .values()
        .filter_map(|process| {
            let command = process
                .cmd()
                .iter()
                .map(|part| part.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" ");
            let executable = process
                .exe()
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default();
            if !looks_like_weline_process(&command, &executable) {
                return None;
            }
            let start = process
                .cwd()
                .map(Path::to_path_buf)
                .or_else(|| process.exe().and_then(|path| path.parent().map(Path::to_path_buf)))?;
            let root = nearest_framework_root(&start)?;
            let php = if executable.contains("php") {
                executable
            } else {
                String::from("php")
            };
            Some((root, php))
        })
        .collect()
}

fn nearby_framework_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(configured) = std::env::var("WELINE_FRAMEWORK_ROOT") {
        push_if_framework(&mut roots, PathBuf::from(configured));
    }
    if let Ok(current) = std::env::current_dir() {
        if let Some(root) = nearest_framework_root(&current) {
            roots.push(root);
        }
        if let Some(parent) = current.parent() {
            push_if_framework(&mut roots, parent.join("框架"));
            scan_children(&mut roots, parent, 1);
        }
        push_if_framework(&mut roots, current.join("框架"));
        scan_children(&mut roots, &current, 1);
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        scan_children(&mut roots, &home.join("Project"), 2);
        scan_children(&mut roots, &home.join("Projects"), 2);
    }
    roots
}

fn scan_children(roots: &mut Vec<PathBuf>, dir: &Path, remaining_depth: usize) {
    if remaining_depth == 0 || !dir.is_dir() || roots.len() >= MAX_DIRECTORY_SCAN {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if roots.len() >= MAX_DIRECTORY_SCAN {
            break;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        push_if_framework(roots, path.clone());
        if remaining_depth > 1 {
            scan_children(roots, &path, remaining_depth - 1);
        }
    }
}

fn push_if_framework(roots: &mut Vec<PathBuf>, path: PathBuf) {
    if path.join("bin/w").is_file() {
        roots.push(path);
    }
}

pub fn nearest_framework_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    for _ in 0..MAX_WALK_DEPTH {
        if current.join("bin/w").is_file() {
            return Some(canonicalize_or_self(current));
        }
        if !current.pop() {
            break;
        }
    }
    None
}

pub fn inspect_framework_root(
    root: &Path,
    running: bool,
    php_binary: &str,
) -> Option<DiscoveredProject> {
    if !root.join("bin/w").is_file() {
        return None;
    }
    let root = canonicalize_or_self(root.to_path_buf());
    let env = parse_env_php(&root);
    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| String::from("Weline"));
    Some(DiscoveredProject {
        name,
        framework_root: root.clone(),
        php_binary: php_binary.to_string(),
        github_repository: github_from_git_config(&root),
        admin_url: env.admin_url,
        site_urls: env.site_urls,
        running,
        source: if running {
            String::from("running")
        } else {
            String::from("nearby")
        },
    })
}

struct EnvHints {
    admin_url: Option<String>,
    site_urls: Vec<String>,
    backend_prefix: Option<String>,
}

pub fn resolve_admin_panel_url(root: &Path, public_origin: Option<&str>) -> Option<String> {
    let env = parse_env_php(root);
    let origin = public_origin
        .map(str::trim)
        .filter(|value| !value.is_empty() && !is_loopback_host(host_of(value).as_str()))
        .map(|value| value.trim_end_matches('/').to_string())
        .or_else(|| {
            env.admin_url
                .as_deref()
                .map(origin_of)
                .filter(|value| !is_loopback_host(host_of(value).as_str()))
        })?;
    Some(join_wls_panel_path(&origin, env.backend_prefix.as_deref()))
}

fn parse_env_php(root: &Path) -> EnvHints {
    let Ok(text) = fs::read_to_string(root.join("app/etc/env.php")) else {
        return EnvHints {
            admin_url: None,
            site_urls: Vec::new(),
            backend_prefix: None,
        };
    };
    let host = php_section_string(&text, "wls", "host");
    let port = php_section_int(&text, "wls", "port").unwrap_or(80);
    let prefix = php_section_string(&text, "backend", "prefix");
    let mut site_urls = Vec::new();
    let admin_url = host.as_ref().map(|host| {
        let origin = public_site_origin(host, port);
        site_urls.push(origin.clone());
        join_wls_panel_path(&origin, prefix.as_deref())
    });
    EnvHints {
        admin_url,
        site_urls,
        backend_prefix: prefix,
    }
}

fn join_wls_panel_path(origin: &str, prefix: Option<&str>) -> String {
    let origin = origin.trim_end_matches('/');
    let mut path = origin.to_string();
    if let Some(prefix) = prefix.filter(|value| !value.is_empty()) {
        path.push('/');
        path.push_str(prefix.trim_matches('/'));
    }
    if !path.contains("/server/backend/wls-panel") {
        path.push_str("/server/backend/wls-panel");
    }
    path
}

fn public_site_origin(host: &str, port: u16) -> String {
    if is_loopback_host(host) {
        return http_origin(host, port);
    }
    if host.contains('.') {
        return format!("https://{host}");
    }
    http_origin(host, port)
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "::1")
}

fn host_of(value: &str) -> String {
    url::Url::parse(value)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_else(|| value.to_string())
}

fn origin_of(value: &str) -> String {
    url::Url::parse(value)
        .ok()
        .map(|parsed| {
            let host = parsed.host_str().unwrap_or_default();
            match parsed.port() {
                Some(port) => format!("{}://{host}:{port}", parsed.scheme()),
                None => format!("{}://{host}", parsed.scheme()),
            }
        })
        .unwrap_or_else(|| value.trim_end_matches('/').to_string())
}

fn http_origin(host: &str, port: u16) -> String {
    if port == 80 {
        format!("http://{host}")
    } else {
        format!("http://{host}:{port}")
    }
}

fn php_string(source: &str, key: &str) -> Option<String> {
    let start = source.find(key)?;
    quoted_string_after(&source[start + key.len()..])
}

fn php_section_string(source: &str, section: &str, key: &str) -> Option<String> {
    let start = php_section_offset(source, section)?;
    php_string(&source[start..], &format!("'{key}'"))
}

fn php_section_int(source: &str, section: &str, key: &str) -> Option<u16> {
    let start = php_section_offset(source, section)?;
    let haystack = &source[start..];
    let needle = format!("'{key}'");
    let key_at = haystack.find(&needle)?;
    let rest = haystack[key_at + needle.len()..].trim_start();
    let rest = rest.trim_start_matches("=>").trim_start();
    let digits = rest
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>();
    digits.parse().ok()
}

fn php_section_offset(source: &str, section: &str) -> Option<usize> {
    source
        .find(&format!("'{section}' =>"))
        .or_else(|| source.find(&format!("\"{section}\" =>")))
}

fn quoted_string_after(source: &str) -> Option<String> {
    let rest = source.trim_start().trim_start_matches("=>").trim_start();
    let quote = rest.chars().next().filter(|character| matches!(character, '\'' | '"'))?;
    let body = rest.get(1..)?;
    let end = body.find(quote)?;
    let value = body[..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn github_from_git_config(root: &Path) -> Option<String> {
    let text = fs::read_to_string(root.join(".git/config")).ok()?;
    for line in text.lines() {
        let line = line.trim();
        let Some(url) = line
            .strip_prefix("url = ")
            .or_else(|| line.strip_prefix("url="))
        else {
            continue;
        };
        if let Some(repository) = github_owner_repo(url.trim()) {
            return Some(repository);
        }
    }
    None
}

pub fn github_owner_repo(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches(".git");
    let rest = if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest
    } else if let Some(index) = trimmed.find("github.com/") {
        &trimmed[index + "github.com/".len()..]
    } else {
        return None;
    };
    let mut parts = rest.split('/');
    let owner = parts.next()?.trim();
    let name = parts.next()?.trim();
    if owner.is_empty() || name.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

fn looks_like_weline_process(command: &str, executable: &str) -> bool {
    let haystack = format!("{command} {executable}").to_lowercase();
    haystack.contains("bin/w")
        || haystack.contains("weline server")
        || haystack.contains("wls-gateway")
        || haystack.contains("worker.php")
        || haystack.contains("/server/bin/")
}

fn canonical_key(path: &Path) -> String {
    canonicalize_or_self(path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

fn canonicalize_or_self(path: PathBuf) -> PathBuf {
    path.canonicalize().unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::{github_owner_repo, inspect_framework_root, nearest_framework_root};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parses_github_owner_and_repository() {
        assert_eq!(
            github_owner_repo("git@github.com:aiweline/weline.git"),
            Some("aiweline/weline".to_string())
        );
        assert_eq!(
            github_owner_repo("https://github.com/aiweline/weline.git"),
            Some("aiweline/weline".to_string())
        );
        assert_eq!(github_owner_repo("https://example.com/org/repo.git"), None);
    }

    #[test]
    fn inspects_running_framework_metadata_from_disk() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::create_dir_all(root.join("app/etc")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("bin/w"), "#!/usr/bin/env php\n").unwrap();
        fs::write(
            root.join(".git/config"),
            "[remote \"origin\"]\n\turl = git@github.com:aiweline/weline.git\n",
        )
        .unwrap();
        fs::write(
            root.join("app/etc/env.php"),
            "<?php return [\n  'router' => ['area_routes' => ['backend' => ['prefix' => 'secret-admin']]],\n  'wls' => ['host' => 'p05113ef3.test.weline.com', 'port' => 9555],\n];",
        )
        .unwrap();

        let project = inspect_framework_root(root, true, "/opt/homebrew/bin/php").unwrap();
        assert!(project.running);
        assert_eq!(project.github_repository.as_deref(), Some("aiweline/weline"));
        assert_eq!(
            project.site_urls,
            vec!["https://p05113ef3.test.weline.com"]
        );
        assert_eq!(
            project.admin_url.as_deref(),
            Some("https://p05113ef3.test.weline.com/secret-admin/server/backend/wls-panel")
        );
        assert_eq!(
            nearest_framework_root(&root.join("app/etc")).as_deref(),
            Some(root.canonicalize().unwrap().as_path())
        );
    }
}
