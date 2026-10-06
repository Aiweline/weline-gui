use crate::models::AgentConfig;
use anyhow::{Context, Result};
use directories::ProjectDirs;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn system_default() -> Result<Self> {
        let project_dirs = ProjectDirs::from("com", "Weline", "WelineGUI")
            .context("unable to resolve the platform configuration directory")?;
        Ok(Self {
            path: project_dirs.config_dir().join("config.json"),
        })
    }

    pub fn at(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load_or_create(&self) -> Result<AgentConfig> {
        if self.path.is_file() {
            let bytes = fs::read(&self.path)
                .with_context(|| format!("unable to read {}", self.path.display()))?;
            let config = serde_json::from_slice(&bytes)
                .with_context(|| format!("invalid JSON in {}", self.path.display()))?;
            return Ok(config);
        }

        let config = AgentConfig {
            framework_root: crate::discover::preferred_framework_root().unwrap_or_default(),
            php_binary: default_php_binary(),
            listen: "127.0.0.1:17640".to_string(),
            access_token: Uuid::new_v4().simple().to_string(),
            github_repository: None,
            admin_url: None,
            site_urls: Vec::new(),
            language: "zh-CN".to_string(),
            refresh_seconds: 3,
            allowed_origins: vec![
                "tauri://localhost".to_string(),
                "http://tauri.localhost".to_string(),
                "https://tauri.localhost".to_string(),
            ],
        };
        self.save(&config)?;
        Ok(config)
    }

    pub fn save(&self, config: &AgentConfig) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("unable to create {}", parent.display()))?;
        }
        let temporary = self.path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(config)?;
        fs::write(&temporary, bytes)
            .with_context(|| format!("unable to write {}", temporary.display()))?;
        fs::rename(&temporary, &self.path)
            .with_context(|| format!("unable to replace {}", self.path.display()))?;
        Ok(())
    }
}

fn default_php_binary() -> String {
    std::env::var("WELINE_PHP_BINARY").unwrap_or_else(|_| "php".to_string())
}

