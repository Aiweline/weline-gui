use crate::discover;
use crate::models::{
    CommandRequest, ControlRequest, CreateWebsiteRequest, DeleteCertificateRequest, HealthResponse,
    LocalAgentEndpoint, OpenExternalRequest, PublicConfig,
};
use crate::service::AgentService;
use anyhow::{Context, Result, bail};
use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use chrono::Utc;
use serde::Serialize;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

#[derive(Clone)]
struct HttpState {
    service: AgentService,
    token: String,
    agent_url: String,
    listen: String,
}

#[derive(Debug)]
struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(serde_json::json!({
            "error": self.0.to_string(),
        }));
        (StatusCode::BAD_REQUEST, body).into_response()
    }
}

impl<E> From<E> for ApiError
where
    E: Into<anyhow::Error>,
{
    fn from(error: E) -> Self {
        Self(error.into())
    }
}

pub async fn serve(
    service: AgentService,
    listen: &str,
    web_root: PathBuf,
    tls_certificate: Option<PathBuf>,
    tls_key: Option<PathBuf>,
) -> Result<()> {
    crate::tls::install_crypto_provider();
    let address: SocketAddr = listen.parse().context("invalid listen address")?;
    if !address.ip().is_loopback() && (tls_certificate.is_none() || tls_key.is_none()) {
        bail!("non-loopback agent listeners require both --tls-cert and --tls-key");
    }
    let config = service.config().await;
    let agent_url = if tls_certificate.is_some() {
        format!("https://{listen}")
    } else {
        format!("http://{listen}")
    };
    let router = build_router(
        service,
        config.access_token,
        config.allowed_origins,
        web_root,
        agent_url,
        listen.to_string(),
    )?;

    match (tls_certificate, tls_key) {
        (Some(certificate), Some(key)) => {
            let tls = RustlsConfig::from_pem_file(certificate, key).await?;
            axum_server::bind_rustls(address, tls)
                .serve(router.into_make_service_with_connect_info::<SocketAddr>())
                .await?;
        }
        (None, None) => {
            let listener = tokio::net::TcpListener::bind(address).await?;
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await?;
        }
        _ => bail!("TLS certificate and key must be configured together"),
    }
    Ok(())
}

fn build_router(
    service: AgentService,
    token: String,
    allowed_origins: Vec<String>,
    web_root: PathBuf,
    agent_url: String,
    listen: String,
) -> Result<Router> {
    let state = HttpState {
        service,
        token,
        agent_url,
        listen,
    };
    let protected = Router::new()
        .route("/api/v1/config", get(get_config).put(put_config))
        .route("/api/v1/snapshot", get(snapshot))
        .route("/api/v1/wls/control", post(control))
        .route("/api/v1/websites", get(list_websites).post(create_website))
        .route("/api/v1/websites/domain-pool", get(list_domain_pool))
        .route("/api/v1/certificates/delete", post(delete_certificate))
        .route("/api/v1/console", post(console))
        .route("/api/v1/update", get(check_update))
        .route("/api/v1/projects/scan", get(scan_projects))
        .route("/api/v1/open-external", post(open_external))
        .route_layer(middleware::from_fn_with_state(state.clone(), authorize));

    let mut cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]);
    let origins = allowed_origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect::<Vec<_>>();
    if !origins.is_empty() {
        cors = cors.allow_origin(origins);
    }

    let index = web_root.join("index.html");
    let static_files = ServeDir::new(web_root).fallback(ServeFile::new(index));
    Ok(Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/local-session", get(local_session))
        .merge(protected)
        .fallback_service(static_files)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state))
}

async fn authorize(State(state): State<HttpState>, request: Request<Body>, next: Next) -> Response {
    let authorized = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "))
        .is_some_and(|candidate| constant_time_equal(candidate.as_bytes(), state.token.as_bytes()));
    if !authorized {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "missing or invalid bearer token"})),
        )
            .into_response();
    }
    next.run(request).await
}

async fn health(State(state): State<HttpState>) -> Json<HealthResponse> {
    let config = state.service.public_config().await;
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        configured: config.configured,
        timestamp: Utc::now().to_rfc3339(),
    })
}

/// Loopback-only bootstrap so desktop and Vite-proxied browsers share one session path.
async fn local_session(
    State(state): State<HttpState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Json<LocalAgentEndpoint>, StatusCode> {
    if !addr.ip().is_loopback() {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(Json(LocalAgentEndpoint {
        agent_url: state.agent_url.clone(),
        token: state.token.clone(),
        listen: state.listen.clone(),
    }))
}

async fn get_config(State(state): State<HttpState>) -> Json<PublicConfig> {
    Json(state.service.public_config().await)
}

async fn put_config(
    State(state): State<HttpState>,
    Json(config): Json<PublicConfig>,
) -> Result<Json<PublicConfig>, ApiError> {
    Ok(Json(state.service.update_config(config).await?))
}

async fn snapshot(State(state): State<HttpState>) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.snapshot().await?))
}

async fn control(
    State(state): State<HttpState>,
    Json(request): Json<ControlRequest>,
) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(
        state
            .service
            .control(&request.action, request.instance.as_deref())
            .await?,
    ))
}

async fn list_websites(State(state): State<HttpState>) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.list_websites().await?))
}

async fn list_domain_pool(State(state): State<HttpState>) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.list_domain_pool().await?))
}

async fn create_website(
    State(state): State<HttpState>,
    Json(request): Json<CreateWebsiteRequest>,
) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.create_website(request).await?))
}

async fn delete_certificate(
    State(state): State<HttpState>,
    Json(request): Json<DeleteCertificateRequest>,
) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.delete_certificate(request).await?))
}

async fn console(
    State(state): State<HttpState>,
    Json(request): Json<CommandRequest>,
) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.execute_console(&request.command).await?))
}

async fn check_update(State(state): State<HttpState>) -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(state.service.check_update().await?))
}

async fn scan_projects() -> Result<Json<impl Serialize>, ApiError> {
    Ok(Json(
        tokio::task::spawn_blocking(discover::scan_local_projects)
            .await
            .context("project scan task failed")?,
    ))
}

async fn open_external(Json(request): Json<OpenExternalRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    let url = request.url;
    tokio::task::spawn_blocking(move || AgentService::open_external_url(&url))
        .await
        .context("open external task failed")??;
    Ok(Json(serde_json::json!({ "ok": true })))
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right.iter())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

#[cfg(test)]
mod tests {
    use super::constant_time_equal;

    #[test]
    fn token_comparison_requires_exact_bytes() {
        assert!(constant_time_equal(b"token", b"token"));
        assert!(!constant_time_equal(b"token", b"Token"));
        assert!(!constant_time_equal(b"token", b"token-long"));
    }
}
