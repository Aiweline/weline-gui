pub mod command_policy;
pub mod config;
pub mod discover;
pub mod http;
pub mod models;
pub mod service;
pub mod tls;
pub mod update;

use config::ConfigStore;
use models::{
    CommandResult, ControlRequest, CreateWebsiteRequest, DashboardSnapshot, DeleteCertificateRequest,
    DeleteCertificateResult, DiscoveredProject, PublicConfig, UpdateInfo, WebsiteRecord,
};
use service::AgentService;
use tauri::State;

#[derive(Clone)]
struct AppState {
    service: AgentService,
}

#[tauri::command]
async fn get_public_config(state: State<'_, AppState>) -> Result<PublicConfig, String> {
    Ok(state.service.public_config().await)
}

#[tauri::command]
async fn save_public_config(
    state: State<'_, AppState>,
    config: PublicConfig,
) -> Result<PublicConfig, String> {
    state
        .service
        .update_config(config)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_snapshot(state: State<'_, AppState>) -> Result<DashboardSnapshot, String> {
    state
        .service
        .snapshot()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn control_wls(
    state: State<'_, AppState>,
    request: ControlRequest,
) -> Result<CommandResult, String> {
    state
        .service
        .control(&request.action, request.instance.as_deref())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn run_framework_command(
    state: State<'_, AppState>,
    command: String,
) -> Result<CommandResult, String> {
    state
        .service
        .execute_console(&command)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn check_for_update(state: State<'_, AppState>) -> Result<UpdateInfo, String> {
    state
        .service
        .check_update()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn scan_local_projects() -> Result<Vec<DiscoveredProject>, String> {
    Ok(tokio::task::spawn_blocking(discover::scan_local_projects)
        .await
        .map_err(|error| error.to_string())?)
}

#[tauri::command]
async fn list_websites(state: State<'_, AppState>) -> Result<Vec<WebsiteRecord>, String> {
    state
        .service
        .list_websites()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_website(
    state: State<'_, AppState>,
    request: CreateWebsiteRequest,
) -> Result<WebsiteRecord, String> {
    state
        .service
        .create_website(request)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_certificate(
    state: State<'_, AppState>,
    request: DeleteCertificateRequest,
) -> Result<DeleteCertificateResult, String> {
    state
        .service
        .delete_certificate(request)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || AgentService::open_external_url(&url))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = ConfigStore::system_default().expect("unable to resolve Weline GUI configuration");
    let config = store
        .load_or_create()
        .expect("unable to load Weline GUI configuration");
    let state = AppState {
        service: AgentService::new(config, store),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_public_config,
            save_public_config,
            get_snapshot,
            control_wls,
            run_framework_command,
            check_for_update,
            scan_local_projects,
            list_websites,
            create_website,
            delete_certificate,
            open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Weline GUI");
}
