use std::path::Path;

use serde::Serialize;

const IGNORE: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "__pycache__",
    ".next",
    ".venv",
    "dist",
    ".DS_Store",
];

#[derive(Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn fs_list(path: String) -> Result<Vec<Entry>, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let mut out: Vec<Entry> = Vec::new();
    let rd = std::fs::read_dir(p).map_err(|e| e.to_string())?;
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if IGNORE.contains(&name.as_str()) {
            continue;
        }
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let is_dir = ft.is_dir();
        let full = entry.path().to_string_lossy().to_string();
        out.push(Entry {
            name,
            path: full,
            is_dir,
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

#[tauri::command]
pub fn fs_read(path: String) -> Result<FileRead, String> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("is a directory".to_string());
    }
    let size = meta.len();
    if size > 1_500_000 {
        return Ok(FileRead {
            content: String::new(),
            too_big: true,
            binary: false,
            size,
        });
    }
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    // crude binary check: any NUL byte in first 8KB
    let scan_len = bytes.len().min(8192);
    let is_binary = bytes[..scan_len].contains(&0u8);
    if is_binary {
        return Ok(FileRead {
            content: String::new(),
            too_big: false,
            binary: true,
            size,
        });
    }
    let content = String::from_utf8_lossy(&bytes).to_string();
    Ok(FileRead {
        content,
        too_big: false,
        binary: false,
        size,
    })
}

#[derive(Serialize)]
pub struct FileRead {
    pub content: String,
    pub too_big: bool,
    pub binary: bool,
    pub size: u64,
}

#[tauri::command]
pub fn fs_write(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(format!("parent directory does not exist: {}", parent.display()));
        }
    }
    std::fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    let p = Path::new(&path);
    if p.exists() {
        return Err("a file or directory with that name already exists".into());
    }
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(format!("parent directory does not exist: {}", parent.display()));
        }
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)
        .map_err(|e| e.to_string())?;
    Ok(())
}
