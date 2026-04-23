mod env;
mod fs;
mod llm;
mod pty;

use fs::{fs_create_file, fs_list, fs_read, fs_write, state_load, state_save};
use llm::{chat_send, import_pasted_chat, pseudocode};
use pty::{pty_close, pty_open, pty_resize, pty_write, PtyState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env::load_dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty_open,
            pty_write,
            pty_resize,
            pty_close,
            fs_list,
            fs_read,
            fs_write,
            fs_create_file,
            state_load,
            state_save,
            pseudocode,
            import_pasted_chat,
            chat_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
