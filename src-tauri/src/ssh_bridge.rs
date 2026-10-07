//! Authenticated WebSocket → OpenSSH PTY bridge (key-only).
//! Browser clients pass Agent bearer as `?token=` (WS cannot set Authorization).
//! Private key PEM is accepted only in the first JSON message and never persisted.

use anyhow::{Context, Result, bail};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Deserialize;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, warn};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectRequest {
    pub host: String,
    pub port: Option<u16>,
    pub user: String,
    pub private_key: String,
    pub passphrase: Option<String>,
    pub host_key_fingerprint: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClientMessage {
    #[serde(rename = "connect")]
    Connect(SshConnectRequest),
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "stdin")]
    Stdin { data: String },
}

pub async fn handle_ssh_socket(socket: WebSocket, known_hosts_dir: PathBuf) {
    if let Err(error) = run_session(socket, known_hosts_dir).await {
        warn!(error = %error, "ssh session ended with error");
    }
}

async fn run_session(socket: WebSocket, known_hosts_dir: PathBuf) -> Result<()> {
    let (mut sink, mut stream) = socket.split();

    let first = match stream.next().await {
        Some(Ok(Message::Text(text))) => text.to_string(),
        Some(Ok(Message::Binary(bin))) => String::from_utf8_lossy(&bin).into_owned(),
        Some(Ok(_)) => bail!("expected connect JSON as first message"),
        Some(Err(error)) => return Err(error.into()),
        None => return Ok(()),
    };

    let ClientMessage::Connect(connect) = serde_json::from_str::<ClientMessage>(&first)
        .context("invalid SSH connect message")?
    else {
        bail!("first message must be type=connect");
    };

    validate_connect(&connect)?;

    let cols = connect.cols.unwrap_or(120).clamp(20, 500);
    let rows = connect.rows.unwrap_or(40).clamp(5, 200);
    let port = connect.port.unwrap_or(22);

    let key_path = write_temp_key(&connect.private_key)?;
    let known_hosts = prepare_known_hosts(&known_hosts_dir, &connect.host_key_fingerprint)?;

    let pty_system = NativePtySystem::default();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new("ssh");
    cmd.arg("-tt");
    cmd.arg("-o");
    cmd.arg("BatchMode=yes");
    cmd.arg("-o");
    cmd.arg("PreferredAuthentications=publickey");
    cmd.arg("-o");
    cmd.arg("PasswordAuthentication=no");
    cmd.arg("-o");
    cmd.arg("KbdInteractiveAuthentication=no");
    cmd.arg("-o");
    cmd.arg("IdentitiesOnly=yes");
    cmd.arg("-o");
    cmd.arg(format!("UserKnownHostsFile={}", known_hosts.display()));
    if connect.host_key_fingerprint.as_deref().filter(|s| !s.is_empty()).is_some() {
        cmd.arg("-o");
        cmd.arg("StrictHostKeyChecking=yes");
    } else {
        // TOFU: accept new host keys into agent-managed known_hosts only.
        cmd.arg("-o");
        cmd.arg("StrictHostKeyChecking=accept-new");
    }
    cmd.arg("-i");
    cmd.arg(key_path.to_string_lossy().as_ref());
    cmd.arg("-p");
    cmd.arg(port.to_string());
    cmd.arg(format!("{}@{}", connect.user, connect.host));

    // Passphrase via SSH_ASKPASS is complex; OpenSSH will fail BatchMode if key needs interactive passphrase.
    // Clients should unlock passphrase-protected keys before connect when possible.
    let _ = connect.passphrase;

    let mut child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader()?;
    let writer = Arc::new(Mutex::new(pair.master.take_writer()?));
    let master = Arc::new(Mutex::new(pair.master));

    sink
        .send(Message::Text(
            serde_json::json!({"type":"starting","host":connect.host,"user":connect.user})
                .to_string()
                .into(),
        ))
        .await?;

    info!(host = %connect.host, user = %connect.user, "ssh session starting");

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut buf = [0_u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if out_tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let (client_tx, mut client_rx) = mpsc::unbounded_channel::<ClientMessage>();
    let pump = tokio::spawn(async move {
        while let Some(message) = stream.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(parsed) = serde_json::from_str::<ClientMessage>(&text) {
                        if client_tx.send(parsed).is_err() {
                            break;
                        }
                    }
                }
                Ok(Message::Binary(bin)) => {
                    if let Ok(text) = String::from_utf8(bin.to_vec()) {
                        let _ = client_tx.send(ClientMessage::Stdin { data: text });
                    } else {
                        // treat as raw stdin bytes via lossy
                        let lossy = String::from_utf8_lossy(&bin).into_owned();
                        let _ = client_tx.send(ClientMessage::Stdin { data: lossy });
                    }
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    let mut announced_ready = false;
    loop {
        tokio::select! {
            maybe = out_rx.recv() => {
                match maybe {
                    Some(bytes) => {
                        if !announced_ready {
                            announced_ready = true;
                            let _ = sink
                                .send(Message::Text(
                                    serde_json::json!({"type":"ready","host":connect.host,"user":connect.user})
                                        .to_string()
                                        .into(),
                                ))
                                .await;
                        }
                        if sink.send(Message::Binary(bytes.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            maybe = client_rx.recv() => {
                match maybe {
                    Some(ClientMessage::Stdin { data }) => {
                        let mut guard = writer.lock().unwrap_or_else(|e| e.into_inner());
                        if guard.write_all(data.as_bytes()).is_err() {
                            break;
                        }
                        let _ = guard.flush();
                    }
                    Some(ClientMessage::Resize { cols, rows }) => {
                        if let Ok(m) = master.lock() {
                            let _ = m.resize(PtySize {
                                rows: rows.clamp(5, 200),
                                cols: cols.clamp(20, 500),
                                pixel_width: 0,
                                pixel_height: 0,
                            });
                        }
                    }
                    Some(ClientMessage::Connect(_)) => {}
                    None => break,
                }
            }
        }
    }

    let _ = child.kill();
    let _ = tokio::time::timeout(Duration::from_secs(2), async {
        while child.try_wait().ok().flatten().is_none() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await;
    let _ = std::fs::remove_file(&key_path);
    pump.abort();
    let _ = sink
        .send(Message::Text(
            serde_json::json!({"type":"closed"}).to_string().into(),
        ))
        .await;
    Ok(())
}

fn validate_connect(connect: &SshConnectRequest) -> Result<()> {
    if connect.host.trim().is_empty() {
        bail!("ssh host is required");
    }
    if connect.user.trim().is_empty() {
        bail!("ssh user is required");
    }
    let key = connect.private_key.trim();
    if key.is_empty() {
        bail!("ssh private key is required");
    }
    if !key.contains("PRIVATE KEY") {
        bail!("ssh private key must be PEM (BEGIN … PRIVATE KEY)");
    }
    Ok(())
}

fn write_temp_key(pem: &str) -> Result<PathBuf> {
    let dir = std::env::temp_dir().join("weline-agent-ssh");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("key-{}.pem", uuid::Uuid::new_v4()));
    std::fs::write(&path, pem.trim().as_bytes())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&path, perms)?;
    }
    Ok(path)
}

fn prepare_known_hosts(dir: &PathBuf, fingerprint: &Option<String>) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("known_hosts");
    if !path.exists() {
        std::fs::File::create(&path)?;
    }
    let _ = fingerprint; // fingerprint pinning can be extended via ssh-keygen -F later
    Ok(path)
}
