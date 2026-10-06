use crate::command_policy::parse_framework_command;
use crate::config::ConfigStore;
use crate::models::{
    AgentConfig, CertificateSiteReference, CommandResult, CreateWebsiteRequest, DashboardSnapshot,
    DeleteCertificateRequest, DeleteCertificateResult, DiskMetrics, DomainPoolRecord, HostMetrics,
    ProcessMetrics, PublicConfig, SiteStatus, UpdateInfo, WebsiteRecord, WlsInstance,
};
use crate::{tls, update};
use anyhow::{Context, Result, bail};
use chrono::Utc;
use serde::Deserialize;
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, System};
use tokio::process::Command;
use tokio::sync::RwLock;
use tokio::time::timeout;
use url::Url;

#[derive(Clone)]
pub struct AgentService {
    config: Arc<RwLock<AgentConfig>>,
    store: ConfigStore,
    cache: Arc<RwLock<ServiceCache>>,
}

#[derive(Default)]
struct ServiceCache {
    instances: Option<(Instant, Vec<WlsInstance>)>,
    managed_domains: Option<(Instant, Vec<String>)>,
    sites: Option<(Instant, String, Vec<SiteStatus>)>,
}

#[derive(Debug, Deserialize)]
struct CreateWebsiteCliResult {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    message: String,
    website: Option<WebsiteRecord>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DeleteCertificateCliResult {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    needs_confirmation: bool,
    #[serde(default)]
    domain: String,
    #[serde(default)]
    message: String,
    #[serde(default)]
    referencing_sites: Vec<CertificateSiteReference>,
    #[serde(default)]
    phase: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawWlsInstance {
    name: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    is_running: bool,
    pid: Option<u32>,
    #[serde(default = "loopback_host")]
    host: String,
    #[serde(default)]
    port: u16,
    #[serde(rename = "count", default)]
    worker_count: usize,
    #[serde(default)]
    daemon: bool,
    #[serde(default)]
    started_at: String,
    #[serde(default)]
    running_time: String,
    #[serde(default)]
    worker_port: u16,
    #[serde(default)]
    edge_http_port: u16,
    #[serde(default)]
    edge_https_port: u16,
    #[serde(default)]
    topology: String,
    #[serde(default)]
    topology_label: String,
    #[serde(default)]
    edge_face: String,
    edge_pid: Option<u32>,
    #[serde(default)]
    edge_owner: String,
    #[serde(default)]
    edge_owner_self: bool,
    #[serde(default)]
    worker_direct: bool,
    #[serde(default)]
    public_host: String,
    #[serde(default)]
    public_origin: String,
    #[serde(default)]
    port_summary: String,
}

impl Default for RawWlsInstance {
    fn default() -> Self {
        Self {
            name: String::new(),
            kind: String::new(),
            status: String::new(),
            is_running: false,
            pid: None,
            host: loopback_host(),
            port: 0,
            worker_count: 0,
            daemon: false,
            started_at: String::new(),
            running_time: String::new(),
            worker_port: 0,
            edge_http_port: 0,
            edge_https_port: 0,
            topology: String::new(),
            topology_label: String::new(),
            edge_face: String::new(),
            edge_pid: None,
            edge_owner: String::new(),
            edge_owner_self: false,
            worker_direct: false,
            public_host: String::new(),
            public_origin: String::new(),
            port_summary: String::new(),
        }
    }
}

fn loopback_host() -> String {
    "127.0.0.1".to_string()
}

impl AgentService {
    pub fn new(config: AgentConfig, store: ConfigStore) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            store,
            cache: Arc::new(RwLock::new(ServiceCache::default())),
        }
    }

    pub async fn config(&self) -> AgentConfig {
        self.config.read().await.clone()
    }

    pub async fn public_config(&self) -> PublicConfig {
        let config = self.config.read().await;
        PublicConfig::from(&*config)
    }

    pub async fn update_config(&self, incoming: PublicConfig) -> Result<PublicConfig> {
        if incoming.refresh_seconds == 0 || incoming.refresh_seconds > 300 {
            bail!("refresh interval must be between 1 and 300 seconds");
        }
        if !incoming.framework_root.as_os_str().is_empty()
            && !incoming.framework_root.join("bin/w").is_file()
        {
            bail!("framework root must contain bin/w");
        }
        let github_repository = normalize_optional(incoming.github_repository);
        let admin_url = normalize_optional(incoming.admin_url);
        if let Some(repository) = github_repository.as_deref() {
            validate_optional_repository(repository)?;
        }
        validate_urls(&incoming.site_urls)?;
        if let Some(url) = admin_url.as_deref() {
            Url::parse(url).context("admin URL is invalid")?;
        }

        let mut config = self.config.write().await;
        config.framework_root = incoming.framework_root;
        config.php_binary = incoming.php_binary;
        config.github_repository = github_repository;
        config.admin_url = admin_url;
        config.site_urls = incoming.site_urls;
        config.language = incoming.language;
        config.refresh_seconds = incoming.refresh_seconds;
        self.store.save(&config)?;
        *self.cache.write().await = ServiceCache::default();
        Ok(PublicConfig::from(&*config))
    }

    pub async fn snapshot(&self) -> Result<DashboardSnapshot> {
        let config = self.config().await;
        assert_framework_root(&config.framework_root)?;
        let metrics_root = config.framework_root.clone();
        let metrics_task =
            tokio::task::spawn_blocking(move || collect_system_metrics(&metrics_root));
        let instances_task = self.list_instances();
        let (metrics, instances) = tokio::join!(metrics_task, instances_task);
        let (host, processes) = metrics??;
        let instances = instances?;
        let sites = self.collect_sites(&config, &instances).await;
        let admin_url = crate::discover::resolve_admin_panel_url(
            &config.framework_root,
            instances
                .iter()
                .find(|instance| instance.is_running && !instance.public_origin.is_empty())
                .map(|instance| instance.public_origin.as_str())
                .or(config.admin_url.as_deref()),
        )
        .or(config.admin_url.clone());

        Ok(DashboardSnapshot {
            generated_at: Utc::now().to_rfc3339(),
            agent_version: env!("CARGO_PKG_VERSION").to_string(),
            framework_root: config.framework_root,
            host,
            instances,
            processes,
            sites,
            admin_url,
        })
    }

    pub async fn list_instances(&self) -> Result<Vec<WlsInstance>> {
        if let Some((captured_at, instances)) = &self.cache.read().await.instances {
            if captured_at.elapsed() < Duration::from_secs(10) {
                return Ok(instances.clone());
            }
        }
        let result = self
            .run_weline_args(&["server:list", "--json"], Duration::from_secs(20))
            .await?;
        if result.exit_code != 0 {
            bail!("server:list failed: {}", result.stderr.trim());
        }
        let json = extract_json(&result.stdout).context("server:list did not return JSON")?;
        let raw: Vec<RawWlsInstance> = serde_json::from_str(json)
            .context("server:list returned an unsupported JSON schema")?;
        let instances = raw.into_iter().map(map_instance).collect::<Vec<_>>();
        self.cache.write().await.instances = Some((Instant::now(), instances.clone()));
        Ok(instances)
    }

    pub async fn control(&self, action: &str, instance: Option<&str>) -> Result<CommandResult> {
        let instance = instance.unwrap_or("default");
        validate_instance_name(instance)?;
        let args = match action {
            "start" => vec!["server:start", instance],
            "stop" => vec!["server:stop", instance],
            "restart" => vec!["server:restart", instance],
            "reload" => vec!["server:reload", instance],
            "status" => vec!["server:status", instance],
            _ => bail!("unsupported WLS action"),
        };
        let result = self.run_weline_args(&args, Duration::from_secs(90)).await?;
        self.cache.write().await.instances = None;
        Ok(result)
    }

    pub async fn execute_console(&self, command: &str) -> Result<CommandResult> {
        let parsed = parse_framework_command(command)?;
        let args = parsed
            .args
            .iter()
            .skip(1)
            .map(String::as_str)
            .collect::<Vec<_>>();
        let mut result = self
            .run_weline_args(&args, Duration::from_secs(120))
            .await?;
        if result.exit_code == 0 && result.stdout.contains("没有找到匹配的命令") {
            result.exit_code = 2;
            if result.stderr.is_empty() {
                result.stderr = "Weline CLI did not recognize the requested command".to_string();
            }
        }
        Ok(result)
    }

    pub async fn list_websites(&self) -> Result<Vec<WebsiteRecord>> {
        let result = self
            .run_weline_args(&["website:listing", "--json"], Duration::from_secs(30))
            .await?;
        if result.exit_code != 0 {
            bail!("website:listing failed: {}", result.stderr.trim());
        }
        let json = extract_cli_json(&result, "website:listing")?;
        serde_json::from_str(json).context("website:listing returned an unsupported JSON schema")
    }

    pub async fn create_website(&self, request: CreateWebsiteRequest) -> Result<WebsiteRecord> {
        let name = request.name.trim();
        let url = request.url.trim();
        if name.is_empty() || url.is_empty() {
            bail!("website name and URL are required");
        }
        let mut owned = vec![
            "website:create".to_string(),
            format!("--name={name}"),
            format!("--url={url}"),
            "--json".to_string(),
        ];
        if let Some(code) = request
            .code
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            owned.insert(3, format!("--code={code}"));
        }
        let args: Vec<&str> = owned.iter().map(String::as_str).collect();
        let result = self.run_weline_args(&args, Duration::from_secs(90)).await?;
        if result.exit_code != 0 {
            let detail = [result.stderr.trim(), result.stdout.trim()]
                .into_iter()
                .find(|value| !value.is_empty())
                .unwrap_or("website:create failed");
            bail!("{detail}");
        }
        let json = extract_cli_json(&result, "website:create")?;
        let parsed: CreateWebsiteCliResult = serde_json::from_str(json)
            .context("website:create returned an unsupported JSON schema")?;
        if !parsed.success && parsed.website.is_none() {
            bail!(if parsed.message.is_empty() {
                "website:create failed".to_string()
            } else {
                parsed.message
            });
        }
        parsed
            .website
            .ok_or_else(|| anyhow::anyhow!(if parsed.message.is_empty() {
                "website:create did not return a website".to_string()
            } else {
                parsed.message
            }))
    }

    pub async fn delete_certificate(
        &self,
        request: DeleteCertificateRequest,
    ) -> Result<DeleteCertificateResult> {
        let domain = request.domain.trim().to_ascii_lowercase();
        if domain.is_empty() {
            bail!("certificate domain is required");
        }
        if matches!(domain.as_str(), "localhost" | "127.0.0.1" | "::1") {
            bail!("local loopback certificates cannot be deleted");
        }

        let mut owned = vec![
            "server:ssl:auto".to_string(),
            "delete".to_string(),
            format!("--domain={domain}"),
            "--json".to_string(),
        ];
        if request.confirm {
            owned.push("--confirm".to_string());
        }
        let args: Vec<&str> = owned.iter().map(String::as_str).collect();
        let result = self.run_weline_args(&args, Duration::from_secs(120)).await?;
        let json = extract_cli_json(&result, "server:ssl:auto delete").unwrap_or("");
        let parsed: DeleteCertificateCliResult = if json.is_empty() {
            DeleteCertificateCliResult {
                success: false,
                needs_confirmation: false,
                domain: domain.clone(),
                message: [result.stderr.trim(), result.stdout.trim()]
                    .into_iter()
                    .find(|value| !value.is_empty())
                    .unwrap_or("certificate delete failed")
                    .to_string(),
                referencing_sites: Vec::new(),
                phase: None,
            }
        } else {
            serde_json::from_str(json)
                .context("server:ssl:auto delete returned an unsupported JSON schema")?
        };

        // Soft confirmation gate: surface needs_confirmation without treating it as a transport error.
        if parsed.needs_confirmation {
            self.invalidate_site_caches().await;
            return Ok(DeleteCertificateResult {
                success: false,
                needs_confirmation: true,
                domain: if parsed.domain.is_empty() {
                    domain
                } else {
                    parsed.domain
                },
                message: parsed.message,
                referencing_sites: parsed.referencing_sites,
                phase: parsed.phase,
            });
        }

        if !parsed.success && result.exit_code != 0 {
            let detail = if parsed.message.is_empty() {
                [result.stderr.trim(), result.stdout.trim()]
                    .into_iter()
                    .find(|value| !value.is_empty())
                    .unwrap_or("certificate delete failed")
                    .to_string()
            } else {
                parsed.message.clone()
            };
            bail!("{detail}");
        }

        self.invalidate_site_caches().await;
        Ok(DeleteCertificateResult {
            success: parsed.success,
            needs_confirmation: false,
            domain: if parsed.domain.is_empty() {
                domain
            } else {
                parsed.domain
            },
            message: if parsed.message.is_empty() {
                if parsed.success {
                    "Certificate deleted".to_string()
                } else {
                    "Certificate deletion failed".to_string()
                }
            } else {
                parsed.message
            },
            referencing_sites: parsed.referencing_sites,
            phase: parsed.phase,
        })
    }

    async fn invalidate_site_caches(&self) {
        let mut cache = self.cache.write().await;
        cache.sites = None;
        cache.managed_domains = None;
    }

    pub fn open_external_url(url: &str) -> Result<()> {
        let parsed = Url::parse(url).context("invalid URL")?;
        if !matches!(parsed.scheme(), "http" | "https") {
            bail!("only http(s) URLs can be opened");
        }
        let mut command = if cfg!(target_os = "macos") {
            let mut open = Command::new("open");
            open.arg(url);
            open
        } else if cfg!(target_os = "windows") {
            let mut open = Command::new("cmd");
            open.args(["/C", "start", "", url]);
            open
        } else {
            let mut open = Command::new("xdg-open");
            open.arg(url);
            open
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("failed to open URL")?;
        Ok(())
    }

    pub async fn check_update(&self) -> Result<UpdateInfo> {
        let config = self.config().await;
        let repository = config
            .github_repository
            .as_deref()
            .context("configure a GitHub owner/repository before checking for updates")?;
        update::check_github_release(repository, env!("CARGO_PKG_VERSION")).await
    }

    async fn run_weline_args(&self, args: &[&str], limit: Duration) -> Result<CommandResult> {
        let config = self.config().await;
        assert_framework_root(&config.framework_root)?;
        let mut command = Command::new(&config.php_binary);
        command
            .arg("bin/w")
            .args(args)
            .current_dir(&config.framework_root)
            .env("NO_COLOR", "1")
            .env("TERM", "dumb")
            .env("CLICOLOR", "0")
            .env("FORCE_COLOR", "0")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let rendered = format!("{} bin/w {}", config.php_binary, args.join(" "));
        let started = Instant::now();
        let output = match timeout(limit, command.output()).await {
            Ok(output) => output?,
            Err(_) => {
                return Ok(CommandResult {
                    command: rendered,
                    exit_code: 124,
                    stdout: String::new(),
                    stderr: format!("command exceeded the {} second limit", limit.as_secs()),
                    duration_ms: started.elapsed().as_millis(),
                    timed_out: true,
                });
            }
        };

        Ok(CommandResult {
            command: rendered,
            exit_code: output.status.code().unwrap_or(1),
            stdout: sanitize_cli_output(&String::from_utf8_lossy(&output.stdout)),
            stderr: sanitize_cli_output(&String::from_utf8_lossy(&output.stderr)),
            duration_ms: started.elapsed().as_millis(),
            timed_out: false,
        })
    }

    async fn collect_sites(
        &self,
        config: &AgentConfig,
        instances: &[WlsInstance],
    ) -> Vec<SiteStatus> {
        let mut candidates = BTreeSet::new();
        for value in &config.site_urls {
            candidates.insert((value.clone(), "configured".to_string()));
        }
        if let Some(admin_url) = &config.admin_url {
            candidates.insert((admin_url.clone(), "admin".to_string()));
        }
        for instance in instances.iter().filter(|instance| instance.is_running) {
            candidates.insert((instance.url.clone(), "wls".to_string()));
        }
        for domain in self.managed_certificate_domains().await {
            candidates.insert((format!("https://{domain}"), "wls-managed".to_string()));
        }

        let cache_key = candidates
            .iter()
            .map(|(url, source)| format!("{source}:{url}"))
            .collect::<Vec<_>>()
            .join("|");
        if let Some((captured_at, key, sites)) = &self.cache.read().await.sites {
            if key == &cache_key && captured_at.elapsed() < Duration::from_secs(60) {
                return sites.clone();
            }
        }

        let mut sites = Vec::new();
        for (candidate, source) in candidates.into_iter().take(20) {
            let parsed = match Url::parse(&candidate) {
                Ok(parsed) => parsed,
                Err(error) => {
                    sites.push(SiteStatus {
                        url: candidate,
                        host: String::new(),
                        port: 0,
                        source,
                        certificate: None,
                        certificate_error: Some(error.to_string()),
                    });
                    continue;
                }
            };
            let host = parsed.host_str().unwrap_or_default().to_string();
            let port = parsed.port_or_known_default().unwrap_or(443);
            let loopback_wls =
                source == "wls" && matches!(host.as_str(), "127.0.0.1" | "localhost" | "::1");
            let (certificate, certificate_error) = if loopback_wls {
                (
                    None,
                    Some(
                        "Configure the public website URL to inspect its TLS certificate"
                            .to_string(),
                    ),
                )
            } else if parsed.scheme() == "https" && !host.is_empty() {
                match tls::inspect_certificate(host.clone(), port).await {
                    Ok(certificate) => (Some(certificate), None),
                    Err(error) => (None, Some(error.to_string())),
                }
            } else {
                (None, Some("TLS is not enabled for this URL".to_string()))
            };
            sites.push(SiteStatus {
                url: candidate,
                host,
                port,
                source,
                certificate,
                certificate_error,
            });
        }
        self.cache.write().await.sites = Some((Instant::now(), cache_key, sites.clone()));
        sites
    }

    async fn managed_certificate_domains(&self) -> Vec<String> {
        if let Some((captured_at, domains)) = &self.cache.read().await.managed_domains {
            if captured_at.elapsed() < Duration::from_secs(60) {
                return domains.clone();
            }
        }
        let domains = match self
            .run_weline_args(&["server:ssl:auto", "list"], Duration::from_secs(20))
            .await
        {
            Ok(result) if result.exit_code == 0 => parse_https_managed_domains(&result.stdout),
            _ => Vec::new(),
        };
        self.cache.write().await.managed_domains = Some((Instant::now(), domains.clone()));
        domains
    }
}

fn map_instance(raw: RawWlsInstance) -> WlsInstance {
    let worker_port = if raw.worker_port > 0 {
        raw.worker_port
    } else {
        raw.port
    };
    let url = public_instance_url(&raw);
    let worker_direct = raw.worker_direct || raw.topology == "direct";
    WlsInstance {
        name: raw.name,
        kind: raw.kind,
        status: raw.status,
        is_running: raw.is_running,
        pid: raw.is_running.then_some(raw.pid).flatten(),
        host: raw.host,
        port: raw.port,
        worker_count: raw.worker_count,
        daemon: raw.daemon,
        started_at: raw.started_at,
        running_time: raw.running_time,
        url,
        worker_port,
        edge_http_port: raw.edge_http_port,
        edge_https_port: raw.edge_https_port,
        topology: raw.topology,
        topology_label: raw.topology_label,
        edge_face: raw.edge_face,
        edge_pid: raw.edge_pid.filter(|pid| *pid > 0),
        edge_owner: raw.edge_owner,
        edge_owner_self: raw.edge_owner_self,
        worker_direct,
        public_host: raw.public_host,
        public_origin: raw.public_origin,
        port_summary: raw.port_summary,
    }
}

fn public_instance_url(raw: &RawWlsInstance) -> String {
    if !raw.public_origin.is_empty() {
        return raw.public_origin.clone();
    }
    let host = if raw.public_host.is_empty() {
        raw.host.as_str()
    } else {
        raw.public_host.as_str()
    };
    if raw.edge_https_port > 0 {
        return if raw.edge_https_port == 443 {
            format!("https://{host}")
        } else {
            format!("https://{host}:{}", raw.edge_https_port)
        };
    }
    if raw.edge_http_port > 0 {
        return if raw.edge_http_port == 80 {
            format!("http://{host}")
        } else {
            format!("http://{host}:{}", raw.edge_http_port)
        };
    }
    let scheme = if raw.port == 80 { "http" } else { "https" };
    if (scheme == "https" && raw.port == 443) || (scheme == "http" && raw.port == 80) {
        format!("{scheme}://{}", raw.host)
    } else if raw.port == 0 {
        format!("http://{}", raw.host)
    } else {
        format!("{scheme}://{}:{}", raw.host, raw.port)
    }
}

fn collect_system_metrics(framework_root: &Path) -> Result<(HostMetrics, Vec<ProcessMetrics>)> {
    let mut system = System::new_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_all();

    let root = framework_root.to_string_lossy();
    let mut processes = system
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
            let is_weline = command.contains(root.as_ref())
                || command.contains("bin/w server:")
                || command.contains("Weline Server")
                || command.contains("wls-gateway");
            if !is_weline {
                return None;
            }
            let role = process_role(&command, &executable, &process.name().to_string_lossy());
            Some(ProcessMetrics {
                pid: process.pid().as_u32(),
                parent_pid: process.parent().map(|pid| pid.as_u32()),
                name: process.name().to_string_lossy().into_owned(),
                role,
                status: format!("{:?}", process.status()).to_lowercase(),
                cpu_usage_percent: process.cpu_usage(),
                memory_bytes: process.memory(),
                command,
                started_at_epoch: process.start_time(),
            })
        })
        .collect::<Vec<_>>();
    processes.sort_by_key(|process| (process.role.clone(), process.pid));

    let disks = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .map(|disk| DiskMetrics {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
        })
        .collect();
    let networks = Networks::new_with_refreshed_list();
    let network_received_bytes = networks
        .values()
        .map(|network| network.total_received())
        .sum();
    let network_transmitted_bytes = networks
        .values()
        .map(|network| network.total_transmitted())
        .sum();
    let load = System::load_average();

    Ok((
        HostMetrics {
            hostname: System::host_name().unwrap_or_else(|| "unknown".to_string()),
            os_name: System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
            os_version: System::os_version().unwrap_or_default(),
            cpu_usage_percent: system.global_cpu_usage(),
            cpu_cores: system.cpus().len(),
            load_average: [load.one, load.five, load.fifteen],
            memory_used_bytes: system.used_memory(),
            memory_total_bytes: system.total_memory(),
            swap_used_bytes: system.used_swap(),
            swap_total_bytes: system.total_swap(),
            uptime_seconds: System::uptime(),
            disks,
            network_received_bytes,
            network_transmitted_bytes,
        },
        processes,
    ))
}

fn process_role(command: &str, executable: &str, name: &str) -> String {
    let haystack = format!("{command} {executable} {name}").to_lowercase();
    for (needle, role) in [
        ("gateway", "Gateway"),
        ("dispatcher", "Dispatcher"),
        ("orchestrator", "Orchestrator"),
        ("worker", "Worker"),
        ("master", "Master"),
        ("shared", "Shared service"),
        ("nginx", "Nginx"),
    ] {
        if haystack.contains(needle) {
            return role.to_string();
        }
    }
    "WLS process".to_string()
}

fn assert_framework_root(path: &Path) -> Result<()> {
    if !path.join("bin/w").is_file() {
        bail!("configured framework root does not contain bin/w");
    }
    Ok(())
}

fn validate_instance_name(instance: &str) -> Result<()> {
    if instance.is_empty()
        || instance.len() > 96
        || !instance.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        bail!("invalid WLS instance name");
    }
    Ok(())
}

fn validate_optional_repository(repository: &str) -> Result<()> {
    let parts = repository.split('/').collect::<Vec<_>>();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || !part.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                })
        })
    {
        bail!("GitHub repository must use owner/name");
    }
    Ok(())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_https_managed_domains(output: &str) -> Vec<String> {
    let plain = sanitize_cli_output(output);
    let mut domains = BTreeSet::new();
    for line in plain.lines() {
        let columns = line.split_whitespace().collect::<Vec<_>>();
        let Some(domain) = columns.first().copied() else {
            continue;
        };
        if columns.get(2).copied() != Some("✓")
            || domain.contains('*')
            || domain.contains('/')
            || Url::parse(&format!("https://{domain}")).is_err()
        {
            continue;
        }
        domains.insert(domain.to_string());
    }
    domains.into_iter().collect()
}

fn sanitize_cli_output(output: &str) -> String {
    strip_orphan_sgr(&strip_ansi(output))
}

fn strip_orphan_sgr(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '[' {
            let mut cursor = index + 1;
            while cursor < chars.len() && (chars[cursor].is_ascii_digit() || chars[cursor] == ';') {
                cursor += 1;
            }
            if cursor > index + 1 && cursor < chars.len() && chars[cursor] == 'm' {
                index = cursor + 1;
                continue;
            }
        }
        output.push(chars[index]);
        index += 1;
    }
    output
}

fn strip_ansi(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut characters = input.chars().peekable();
    while let Some(character) = characters.next() {
        if character != '\u{1b}' || characters.peek() != Some(&'[') {
            output.push(character);
            continue;
        }
        characters.next();
        for sequence_character in characters.by_ref() {
            if sequence_character.is_ascii_alphabetic() {
                break;
            }
        }
    }
    output
}

fn validate_urls(urls: &[String]) -> Result<()> {
    for value in urls {
        let url = Url::parse(value).with_context(|| format!("invalid site URL: {value}"))?;
        if !matches!(url.scheme(), "http" | "https") {
            bail!("site URL must use http or https");
        }
    }
    Ok(())
}

fn extract_cli_json<'a>(result: &'a CommandResult, label: &str) -> Result<&'a str> {
    let blob = if result.stdout.trim().is_empty() {
        result.stderr.as_str()
    } else {
        result.stdout.as_str()
    };
    if blob.contains("没有找到匹配的命令") {
        bail!("{label} is not registered on this framework root");
    }
    extract_json(blob).with_context(|| format!("{label} did not return JSON"))
}

pub fn extract_json(output: &str) -> Option<&str> {
    for (index, character) in output.char_indices() {
        if !matches!(character, '[' | '{') {
            continue;
        }
        let slice = &output[index..];
        let mut stream = serde_json::Deserializer::from_str(slice).into_iter::<serde_json::Value>();
        if matches!(stream.next(), Some(Ok(_))) {
            return Some(slice[..stream.byte_offset()].trim());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{
        RawWlsInstance, extract_json, map_instance, normalize_optional, parse_https_managed_domains,
        sanitize_cli_output,
    };
    use crate::models::WebsiteRecord;

    #[test]
    fn extracts_json_after_cli_noise() {
        assert_eq!(
            extract_json("notice\n[{\"name\":\"default\"}]"),
            Some("[{\"name\":\"default\"}]")
        );
        assert_eq!(extract_json("no json"), None);
        assert_eq!(
            extract_json("in {main}\n[{\"name\":\"default\"}]\n执行命令：website:listing --json"),
            Some("[{\"name\":\"default\"}]")
        );
    }

    #[test]
    fn parses_website_listing_snake_case_json() {
        let json = r#"[{"website_id":0,"name":"默认网站","code":"default","url":"http://localhost","default_currency":"CNY","default_language":"zh_Hans_CN","default_timezone":"Asia/Shanghai","scope":""}]"#;
        let rows: Vec<WebsiteRecord> = serde_json::from_str(json).expect("website listing json");
        assert_eq!(rows[0].website_id, 0);
        assert_eq!(rows[0].code, "default");
        assert_eq!(rows[0].default_language, "zh_Hans_CN");
    }

    #[test]
    fn rejects_non_http_external_urls() {
        assert!(crate::service::AgentService::open_external_url("file:///tmp/secret").is_err());
        assert!(crate::service::AgentService::open_external_url("not-a-url").is_err());
    }

    #[test]
    fn strips_ansi_and_orphan_sgr_from_cli_tables() {
        let dirty = "\u{1b}[34m服务器实例列表\u{1b}[0m [32mPID:23438 [0m";
        let plain = sanitize_cli_output(dirty);
        assert_eq!(plain, "服务器实例列表 PID:23438 ");
        assert!(!plain.contains("[34m"));
        assert!(!plain.contains('\u{1b}'));
    }

    #[test]
    fn blank_optional_setup_values_are_unset() {
        assert_eq!(normalize_optional(Some("   ".to_string())), None);
        assert_eq!(
            normalize_optional(Some(" owner/repo ".to_string())),
            Some("owner/repo".to_string())
        );
    }

    #[test]
    fn stopped_instances_do_not_expose_stale_process_ids() {
        let instance = map_instance(RawWlsInstance {
            name: "stopped".to_string(),
            kind: "weline".to_string(),
            status: "stopped".to_string(),
            is_running: false,
            pid: Some(424_250),
            host: "127.0.0.1".to_string(),
            port: 9555,
            worker_count: 4,
            daemon: true,
            ..RawWlsInstance::default()
        });
        assert_eq!(instance.pid, None);
    }

    #[test]
    fn managed_nginx_instances_expose_public_edge_and_nginx_pid() {
        let instance = map_instance(RawWlsInstance {
            name: "default".to_string(),
            is_running: true,
            pid: Some(23438),
            host: "127.0.0.1".to_string(),
            port: 9555,
            worker_count: 4,
            worker_port: 9555,
            edge_http_port: 80,
            edge_https_port: 443,
            topology: "direct".to_string(),
            topology_label: "直连".to_string(),
            edge_face: "managed_nginx".to_string(),
            edge_pid: Some(1888),
            edge_owner: "default".to_string(),
            edge_owner_self: true,
            worker_direct: true,
            public_host: "p05113ef3.test.weline.com".to_string(),
            public_origin: "https://p05113ef3.test.weline.com".to_string(),
            port_summary: "Worker:9555(4) nG:80/443".to_string(),
            ..RawWlsInstance::default()
        });
        assert_eq!(instance.url, "https://p05113ef3.test.weline.com");
        assert_eq!(instance.edge_pid, Some(1888));
        assert!(instance.worker_direct);
        assert_eq!(instance.edge_owner, "default");
    }

    #[test]
    fn parses_certificate_delete_confirmation_json() {
        let json = r#"{"success":false,"needs_confirmation":true,"domain":"shop.example.test","message":"referenced","referencing_sites":[{"domain":"shop.example.test","website_id":2,"source":"website_domain","label":"网站 #2"}],"phase":null}"#;
        let parsed: super::DeleteCertificateCliResult =
            serde_json::from_str(json).expect("delete confirmation json");
        assert!(parsed.needs_confirmation);
        assert!(!parsed.success);
        assert_eq!(parsed.domain, "shop.example.test");
        assert_eq!(parsed.referencing_sites.len(), 1);
        assert_eq!(parsed.referencing_sites[0].website_id, 2);
    }

    fn discovers_enabled_non_wildcard_domains_from_wls_certificate_list() {
        let output = "\u{1b}[34m域名 状态 HTTPS 到期时间 自动续签\u{1b}[0m\n\
            p05113ef3.weline.test 有效 ✓ 2028-11-01 02:20:45 ✗\n\
            frz004.localhost 有效 ✗ 2027-08-11 10:50:39 ✗\n\
            *.weline.test 有效 ✓ 2028-10-31 19:17:48 ✗\n";
        assert_eq!(
            parse_https_managed_domains(output),
            vec!["p05113ef3.weline.test"]
        );
    }
}
