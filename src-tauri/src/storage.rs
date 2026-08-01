use std::{
    fs::{self, File},
    io::{BufReader, BufWriter, Write},
    path::{Path, PathBuf},
};

use serde::{de::DeserializeOwned, Serialize};

use crate::model::{RuntimeData, Settings};

#[derive(Debug)]
pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn load_settings(&self) -> Settings {
        read_json_with_backup(&self.root.join("settings.json"))
            .unwrap_or_default()
            .normalize()
    }

    pub fn load_runtime(&self) -> RuntimeData {
        read_json_with_backup(&self.root.join("runtime.json"))
            .unwrap_or_default()
            .normalize()
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        atomic_write_json(&self.root.join("settings.json"), settings)
    }

    pub fn save_runtime(&self, runtime: &RuntimeData) -> Result<(), String> {
        atomic_write_json(&self.root.join("runtime.json"), runtime)
    }
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let file = File::open(path).map_err(|error| format!("无法打开 {}：{error}", path.display()))?;
    serde_json::from_reader(BufReader::new(file))
        .map_err(|error| format!("无法解析 {}：{error}", path.display()))
}

fn read_json_with_backup<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    match read_json(path) {
        Ok(value) => Ok(value),
        Err(primary_error) => {
            let backup = sibling_with_suffix(path, ".bak");
            read_json(&backup).map_err(|backup_error| {
                format!("{primary_error}；备份恢复也失败：{backup_error}")
            })
        }
    }
}

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("无效的数据文件路径：{}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建数据目录 {}：{error}", parent.display()))?;

    let temporary = sibling_with_suffix(path, ".tmp");
    let backup = sibling_with_suffix(path, ".bak");

    if temporary.exists() {
        fs::remove_file(&temporary)
            .map_err(|error| format!("无法清理临时文件 {}：{error}", temporary.display()))?;
    }

    {
        let file = File::create(&temporary)
            .map_err(|error| format!("无法创建临时文件 {}：{error}", temporary.display()))?;
        let mut writer = BufWriter::new(file);
        serde_json::to_writer_pretty(&mut writer, value)
            .map_err(|error| format!("无法序列化状态：{error}"))?;
        writer
            .write_all(b"\n")
            .map_err(|error| format!("无法完成临时文件：{error}"))?;
        writer
            .flush()
            .map_err(|error| format!("无法刷新临时文件：{error}"))?;
        writer
            .get_ref()
            .sync_all()
            .map_err(|error| format!("无法同步临时文件：{error}"))?;
    }

    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|error| format!("无法清理旧备份 {}：{error}", backup.display()))?;
    }

    if path.exists() {
        fs::rename(path, &backup)
            .map_err(|error| format!("无法备份旧状态 {}：{error}", path.display()))?;
    }

    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() && !path.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(format!("无法替换状态文件 {}：{error}", path.display()));
    }

    sync_directory(parent);
    // Keep the previous complete version as a recovery point for the next launch.
    Ok(())
}

fn sibling_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "quickcalc".to_owned());
    path.with_file_name(format!("{file_name}{suffix}"))
}

#[cfg(unix)]
fn sync_directory(path: &Path) {
    if let Ok(directory) = File::open(path) {
        let _ = directory.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::sibling_with_suffix;
    use std::path::Path;

    #[test]
    fn suffix_is_added_after_the_full_file_name() {
        assert_eq!(
            sibling_with_suffix(Path::new("/tmp/runtime.json"), ".bak"),
            Path::new("/tmp/runtime.json.bak")
        );
    }
}
