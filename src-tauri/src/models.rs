use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub framework_root: PathBuf,
    pub php_binary: String,
    pub listen: String,
    pub access_token: String,
    pub github_repository: Option<String>,
    pub admin_url: Option<String>,
    pub site_urls: Vec<String>,
    pub language: String,
    pub refresh_seconds: u64,
    pub allowed_origins: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub framework_root: PathBuf,
    pub php_binary: String,
    pub listen: String,
    pub github_repository: Option<String>,
    pub admin_url: Option<String>,
    pub site_urls: Vec<String>,
    pub language: String,
    pub refresh_seconds: u64,
    pub configured: bool,
}

impl From<&AgentConfig> for PublicConfig {
    fn from(value: &AgentConfig) -> Self {
        Self {
            framework_root: value.framework_root.clone(),
            php_binary: value.php_binary.clone(),
            listen: value.listen.clone(),
            github_repository: value.github_repository.clone(),
            admin_url: value.admin_url.clone(),
            site_urls: value.site_urls.clone(),
            language: value.language.clone(),
            refresh_seconds: value.refresh_seconds,
            configured: value.framework_root.join("bin/w").is_file(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostMetrics {
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub cpu_usage_percent: f32,
    pub cpu_cores: usize,
    pub load_average: [f64; 3],
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
    pub uptime_seconds: u64,
    pub disks: Vec<DiskMetrics>,
    pub network_received_bytes: u64,
    pub network_transmitted_bytes: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskMetrics {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub role: String,
    pub status: String,
    pub cpu_usage_percent: f32,
    pub memory_bytes: u64,
    pub command: String,
    pub started_at_epoch: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WlsInstance {
    pub name: String,
    pub kind: String,
    pub status: String,
    pub is_running: bool,
    pub pid: Option<u32>,
    pub host: String,
    pub port: u16,
    pub worker_count: usize,
    pub daemon: bool,
    pub started_at: String,
    pub running_time: String,
    pub url: String,
    pub worker_port: u16,
    pub edge_http_port: u16,
    pub edge_https_port: u16,
    pub topology: String,
    pub topology_label: String,
    pub edge_face: String,
    pub edge_pid: Option<u32>,
    pub edge_owner: String,
    pub edge_owner_self: bool,
    pub worker_direct: bool,
    pub public_host: String,
    pub public_origin: String,
    pub port_summary: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    pub host: String,
    pub port: u16,
    pub subject: String,
    pub issuer: String,
    pub serial: String,
    pub fingerprint_sha256: String,
    pub not_before: String,
    pub not_after: String,
    pub days_remaining: i64,
    pub valid_now: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteStatus {
    pub url: String,
    pub host: String,
    pub port: u16,
    pub source: String,
    pub certificate: Option<CertificateInfo>,
    pub certificate_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
    pub generated_at: String,
    pub agent_version: String,
    pub framework_root: PathBuf,
    pub host: HostMetrics,
    pub instances: Vec<WlsInstance>,
    pub processes: Vec<ProcessMetrics>,
    pub sites: Vec<SiteStatus>,
    pub admin_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsiteRecord {
    #[serde(alias = "website_id")]
    pub website_id: i64,
    pub name: String,
    pub code: String,
    pub url: String,
    #[serde(default, alias = "default_currency")]
    pub default_currency: String,
    #[serde(default, alias = "default_language")]
    pub default_language: String,
    #[serde(default, alias = "default_timezone")]
    pub default_timezone: String,
    #[serde(default)]
    pub scope: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainPoolRecord {
    #[serde(alias = "pool_id")]
    pub pool_id: i64,
    pub domain: String,
    #[serde(default, alias = "root_domain")]
    pub root_domain: String,
    #[serde(default)]
    pub status: String,
    #[serde(default, alias = "https_status")]
    pub https_status: String,
    #[serde(default, alias = "site_ready")]
    pub site_ready: i64,
    #[serde(default, alias = "site_created")]
    pub site_created: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebsiteRequest {
    pub name: String,
    #[serde(default)]
    pub url: Option<String>,
    pub code: Option<String>,
    #[serde(default, alias = "pool_id")]
    pub pool_id: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCertificateRequest {
    pub domain: String,
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateSiteReference {
    pub domain: String,
    #[serde(alias = "website_id")]
    pub website_id: i64,
    pub source: String,
    pub label: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCertificateResult {
    pub success: bool,
    #[serde(alias = "needs_confirmation")]
    pub needs_confirmation: bool,
    pub domain: String,
    pub message: String,
    #[serde(default, alias = "referencing_sites")]
    pub referencing_sites: Vec<CertificateSiteReference>,
    #[serde(default)]
    pub phase: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequest {
    pub command: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
    pub timed_out: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlRequest {
    pub action: String,
    pub instance: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub published_at: Option<String>,
    pub notes: String,
    pub repository: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub configured: bool,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentEndpoint {
    pub agent_url: String,
    pub token: String,
    pub listen: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalRequest {
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredProject {
    pub name: String,
    pub framework_root: PathBuf,
    pub php_binary: String,
    pub github_repository: Option<String>,
    pub admin_url: Option<String>,
    pub site_urls: Vec<String>,
    pub running: bool,
    pub source: String,
}
