use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

pub struct PtyState {
    pub entries: Arc<Mutex<HashMap<String, PtyEntry>>>,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub struct PtyEntry {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    /// Keeping the child alive; dropped on close to send SIGHUP.
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    state: State<'_, PtyState>,
    chat_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let _ = chat_id; // not used on server side; useful for logs

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(4),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    cmd.cwd(cwd);
    // Expose a friendly TERM and locale.
    cmd.env("TERM", "xterm-256color");
    if std::env::var("LANG").is_err() {
        cmd.env("LANG", "en_US.UTF-8");
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;

    let pty_id = uuid::Uuid::new_v4().to_string();
    let event_name = format!("pty://{}/data", pty_id);

    // Reader thread: bytes → event.
    {
        let app = app.clone();
        let event_name = event_name.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(&event_name, chunk);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let entry = PtyEntry {
        master: pair.master,
        writer,
        _child: child,
    };

    state.entries.lock().insert(pty_id.clone(), entry);
    Ok(pty_id)
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, pty_id: String, data: String) -> Result<(), String> {
    let mut guard = state.entries.lock();
    let entry = guard.get_mut(&pty_id).ok_or("no such pty")?;
    entry
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    entry.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let guard = state.entries.lock();
    let entry = guard.get(&pty_id).ok_or("no such pty")?;
    entry
        .master
        .resize(PtySize {
            rows: rows.max(4),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_close(state: State<'_, PtyState>, pty_id: String) -> Result<(), String> {
    state.entries.lock().remove(&pty_id); // drop kills child
    Ok(())
}
