use crate::models::UpdateInfo;
use anyhow::{Context, Result, bail};
use semver::Version;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
    body: Option<String>,
    draft: bool,
    prerelease: bool,
}

pub fn is_newer_release(current: &str, latest: &str) -> Result<bool> {
    let current = Version::parse(current.trim_start_matches('v'))
        .with_context(|| format!("invalid current semantic version: {current}"))?;
    let latest = Version::parse(latest.trim_start_matches('v'))
        .with_context(|| format!("invalid release semantic version: {latest}"))?;
    Ok(latest > current)
}

pub async fn check_github_release(repository: &str, current: &str) -> Result<UpdateInfo> {
    validate_repository(repository)?;
    let endpoint = format!("https://api.github.com/repos/{repository}/releases/latest");
    let release = reqwest::Client::new()
        .get(endpoint)
        .header(reqwest::header::USER_AGENT, "Weline-GUI-update-checker")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json::<GithubRelease>()
        .await?;

    if release.draft || release.prerelease {
        bail!("GitHub latest release is not a stable published release");
    }

    Ok(UpdateInfo {
        current_version: current.to_string(),
        latest_version: release.tag_name.clone(),
        update_available: is_newer_release(current, &release.tag_name)?,
        release_url: release.html_url,
        published_at: release.published_at,
        notes: release.body.unwrap_or_default(),
        repository: repository.to_string(),
    })
}

fn validate_repository(repository: &str) -> Result<()> {
    let parts = repository.split('/').collect::<Vec<_>>();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || !part.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                })
        })
    {
        bail!("GitHub repository must use the owner/name format");
    }
    Ok(())
}
