//! Authenticated WebSocket → local interactive shell PTY.
//! Default cwd is the configured framework root (current project).
//! Browser clients pass Agent bearer as `?token=`.

use anyhow::{Context, Result, bail};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Deserialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, warn};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellConnectRequest {
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClientMessage {
    #[serde(rename = "connect")]
    Connect(ShellConnectRequest),
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
    #[serde(rename = "stdin")]
    Stdin { data: String },
}

pub async fn handle_shell_socket(socket: WebSocket, default_cwd: PathBuf) {
    if let Err(error) = run_session(socket, default_cwd).await {
        warn!(error = %error, "local shell session ended with error");
    }
}

async fn run_session(socket: WebSocket, default_cwd: PathBuf) -> Result<()> {
    let (mut sink, mut stream) = socket.split();

    let first = loop {
        match stream.next().await {
            Some(Ok(Message::Text(text))) => break text.to_string(),
            Some(Ok(Message::Binary(bin))) => break String::from_utf8_lossy(&bin).into_owned(),
            Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => continue,
            Some(Ok(Message::Close(_))) | None => return Ok(()),
            Some(Err(error)) => return Err(error.into()),
        }
    };

    let ClientMessage::Connect(connect) = serde_json::from_str::<ClientMessage>(&first)
        .context("invalid shell connect message")?
    else {
        bail!("first message must be type=connect");
    };

    let cols = connect.cols.unwrap_or(120).clamp(20, 500);
    let rows = connect.rows.unwrap_or(40).clamp(5, 200);
    let cwd = resolve_cwd(connect.cwd.as_deref(), &default_cwd)?;

    let pty_system = NativePtySystem::default();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let shell = default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    #[cfg(unix)]
    {
        if shell.ends_with("zsh") || shell.ends_with("bash") || shell.ends_with("sh") {
            cmd.arg("-l");
        }
    }
    cmd.cwd(&cwd);

    let mut child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader()?;
    let writer = Arc::new(Mutex::new(pair.master.take_writer()?));
    let master = Arc::new(Mutex::new(pair.master));

    sink
        .send(Message::Text(
            serde_json::json!({
                "type": "ready",
                "cwd": cwd.display().to_string(),
                "shell": shell,
            })
            .to_string()
            .into(),
        ))
        .await?;

    info!(cwd = %cwd.display(), shell = %shell, "local shell session started");

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
                    let lossy = String::from_utf8_lossy(&bin).into_owned();
                    let _ = client_tx.send(ClientMessage::Stdin { data: lossy });
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    loop {
        tokio::select! {
            maybe = out_rx.recv() => {
                match maybe {
                    Some(bytes) => {
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
    pump.abort();
    let _ = sink
        .send(Message::Text(
            serde_json::json!({"type":"closed"}).to_string().into(),
        ))
        .await;
    Ok(())
}

fn resolve_cwd(requested: Option<&str>, default_cwd: &Path) -> Result<PathBuf> {
    let candidate = requested
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_cwd.to_path_buf());
    if !candidate.is_absolute() {
        bail!("shell cwd must be an absolute path");
    }
    if !candidate.is_dir() {
        bail!("shell cwd is not a directory: {}", candidate.display());
    }
    Ok(candidate)
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            "/bin/zsh".to_string()
        }
    })
}
