use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use uuid::Uuid;
use weline_gui_lib::config::ConfigStore;
use weline_gui_lib::http;
use weline_gui_lib::service::AgentService;

#[derive(Debug, Parser)]
#[command(
    name = "weline-agent",
    version,
    about = "Weline WLS headless control agent"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Serve {
        #[arg(long)]
        framework_root: Option<PathBuf>,
        #[arg(long)]
        php_binary: Option<String>,
        #[arg(long)]
        listen: Option<String>,
        #[arg(long)]
        token: Option<String>,
        #[arg(long)]
        tls_cert: Option<PathBuf>,
        #[arg(long)]
        tls_key: Option<PathBuf>,
        #[arg(long, default_value = "dist")]
        web_root: PathBuf,
    },
    Config,
    /// Print the agent access token, or rotate it before printing.
    Token {
        #[arg(long)]
        rotate: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "weline_gui=info,tower_http=info".into()),
        )
        .init();
    let cli = Cli::parse();
    let store = ConfigStore::system_default()?;
    let mut config = store.load_or_create()?;

    match cli.command {
        Command::Config => {
            let mut public =
                serde_json::to_value(weline_gui_lib::models::PublicConfig::from(&config))?;
            public["configPath"] = serde_json::json!(store.path());
            println!("{}", serde_json::to_string_pretty(&public)?);
        }
        Command::Token { rotate } => {
            if rotate {
                config.access_token = Uuid::new_v4().simple().to_string();
                store.save(&config)?;
            }
            println!("{}", config.access_token);
        }
        Command::Serve {
            framework_root,
            php_binary,
            listen,
            token,
            tls_cert,
            tls_key,
            web_root,
        } => {
            if let Some(value) = framework_root {
                config.framework_root = value;
            }
            if let Some(value) = php_binary {
                config.php_binary = value;
            }
            if let Some(value) = listen {
                config.listen = value;
            }
            if let Some(value) = token {
                config.access_token = value;
            }
            store.save(&config)?;
            let listen = config.listen.clone();
            let service = AgentService::new(config, store);
            println!("Weline agent listening on {listen}");
            println!("Access token: configured (run `weline-agent token` to inspect)");
            println!(
                "Framework root: {}",
                service.public_config().await.framework_root.display()
            );
            http::serve(service, &listen, web_root, tls_cert, tls_key)
                .await
                .context("Weline agent stopped")?;
        }
    }
    Ok(())
}
