pub mod command_catalog;
pub mod command_policy;
pub mod config;
pub mod discover;
pub mod http;
pub mod models;
pub mod service;
pub mod shell_bridge;
pub mod ssh_bridge;
pub mod tls;
pub mod update;

use config::ConfigStore;
use models::LocalAgentEndpoint;
use service::AgentService;
use std::fs;
use std::path::PathBuf;
use tauri::State;

#[derive(Clone)]
struct AppState {
    service: AgentService,
    agent_url: String,
}

/// Sole desktop IPC: return loopback Agent HTTP endpoint + bearer token.
/// All business traffic goes through `/api/v1/*` on that endpoint.
#[tauri::command]
async fn get_local_agent_endpoint(state: State<'_, AppState>) -> Result<LocalAgentEndpoint, String> {
    let config = state.service.config().await;
    Ok(LocalAgentEndpoint {
        agent_url: state.agent_url.clone(),
        token: config.access_token,
        listen: config.listen,
    })
}

const MENU_RELOAD_PAGE: &str = "reload_page";

#[cfg(desktop)]
fn install_desktop_chrome_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind, Submenu};

    let reload = MenuItem::with_id(
        app,
        MENU_RELOAD_PAGE,
        "Reload Page",
        true,
        Some("CmdOrCtrl+R"),
    )?;

    let menu = Menu::default(app)?;
    let mut view_found = false;
    for item in menu.items()? {
        if let MenuItemKind::Submenu(sub) = item {
            if sub.text()? == "View" {
                sub.prepend(&reload)?;
                view_found = true;
                break;
            }
        }
    }
    if !view_found {
        let view = Submenu::with_items(app, "View", true, &[&reload])?;
        menu.append(&view)?;
    }
    app.set_menu(menu)?;
    Ok(())
}

#[cfg(desktop)]
fn reload_main_webview(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.reload();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = ConfigStore::system_default().expect("unable to resolve Weline GUI configuration");
    let mut config = store
        .load_or_create()
        .expect("unable to load Weline GUI configuration");
    if ConfigStore::ensure_client_origins(&mut config) {
        store
            .save(&config)
            .expect("unable to persist allowed origins");
    }

    let listen = config.listen.clone();
    let agent_url = format!("http://{listen}");
    let service = AgentService::new(config, store.clone());
    let http_service = service.clone();
    let web_root = agent_web_root();

    tauri::async_runtime::spawn(async move {
        if let Err(error) = http::serve(http_service, &listen, web_root, None, None).await {
            tracing::error!(error = %error, listen = %listen, "embedded agent HTTP failed");
        }
    });

    let state = AppState { service, agent_url };

    let mut builder = tauri::Builder::default().manage(state).invoke_handler(
        tauri::generate_handler![get_local_agent_endpoint],
    );

    #[cfg(desktop)]
    {
        builder = builder
            .setup(|app| {
                if let Err(error) = install_desktop_chrome_menu(app.handle()) {
                    tracing::warn!(error = %error, "desktop chrome menu unavailable");
                }
                Ok(())
            })
            .on_menu_event(|app, event| {
                if event.id().as_ref() == MENU_RELOAD_PAGE {
                    reload_main_webview(app);
                }
            });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running Weline GUI");
}

fn agent_web_root() -> PathBuf {
    let dist = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    if dist.join("index.html").is_file() {
        return dist;
    }
    let dir = std::env::temp_dir().join("weline-gui-agent-static");
    let _ = fs::create_dir_all(&dir);
    let index = dir.join("index.html");
    if !index.is_file() {
        let _ = fs::write(
            &index,
            b"<!doctype html><meta charset=\"utf-8\"><title>Weline Agent</title><p>Weline Agent API</p>",
        );
    }
    dir
}
