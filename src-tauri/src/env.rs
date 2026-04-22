use std::path::PathBuf;

/// Load a `.env` file at startup. Search paths in order:
///
/// 1. `GITCHAT_ENV_FILE` environment variable (explicit override)
/// 2. The current working directory
/// 3. `CARGO_MANIFEST_DIR/..` (i.e. the project root, in dev)
/// 4. Two levels up from the current executable (works when running
///    `src-tauri/target/.../gitchat`)
/// 5. `~/.gitchat.env`
///
/// Never panics, never overwrites a variable that was already set in the
/// process environment — existing shell exports win.
pub fn load_dotenv() {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(explicit) = std::env::var("GITCHAT_ENV_FILE") {
        candidates.push(PathBuf::from(explicit));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(".env"));
    }
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        candidates.push(PathBuf::from(manifest).join("..").join(".env"));
        candidates.push(PathBuf::from(manifest).join(".env"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            candidates.push(parent.join(".env"));
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(PathBuf::from(home).join(".gitchat.env"));
    }

    for path in candidates {
        if path.is_file() {
            match dotenvy::from_path(&path) {
                Ok(_) => {
                    eprintln!("[gitchat] loaded env from {}", path.display());
                    return;
                }
                Err(e) => {
                    eprintln!("[gitchat] failed to read {}: {e}", path.display());
                }
            }
        }
    }
}
