use std::{env, fs, path::PathBuf};

use serde::Serialize;

const QUICKCALC_VERSION: &str = env!("CARGO_PKG_VERSION");
const ALLOWED_PERMISSIONS: &[&str] = &["commands", "settings", "clipboard"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginDescriptor {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub permissions: Vec<String>,
    pub compatible: bool,
    pub error: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    id: String,
    name: String,
    version: String,
    description: Option<String>,
    #[serde(default)]
    min_quickcalc_version: Option<String>,
    #[serde(default)]
    permissions: Vec<String>,
}

pub fn discover() -> Vec<PluginDescriptor> {
    let root = plugin_root();
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut plugins = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| {
            let manifest_path = entry.path().join("plugin.json");
            let fallback = entry.file_name().to_string_lossy().into_owned();
            match fs::read_to_string(&manifest_path)
                .ok()
                .and_then(|raw| serde_json::from_str::<PluginManifest>(&raw).ok())
            {
                Some(manifest) => {
                    let error = validate(&manifest);
                    PluginDescriptor {
                        id: manifest.id,
                        name: manifest.name,
                        version: manifest.version,
                        description: manifest.description,
                        permissions: manifest.permissions,
                        compatible: error.is_none(),
                        error,
                    }
                }
                None => PluginDescriptor {
                    id: fallback.clone(),
                    name: fallback,
                    version: String::new(),
                    description: None,
                    permissions: Vec::new(),
                    compatible: false,
                    error: Some("plugin.json 缺失或无效".to_owned()),
                },
            }
        })
        .collect::<Vec<_>>();
    plugins.sort_by(|a, b| a.id.cmp(&b.id));
    plugins
}

pub fn plugin_root() -> PathBuf {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".quickcalc")
        .join("plugins")
}

fn validate(manifest: &PluginManifest) -> Option<String> {
    if manifest.id.trim().is_empty()
        || manifest.name.trim().is_empty()
        || manifest.version.trim().is_empty()
    {
        return Some("插件清单需要 id、name 和 version".to_owned());
    }
    if manifest
        .permissions
        .iter()
        .any(|permission| !ALLOWED_PERMISSIONS.contains(&permission.as_str()))
    {
        return Some("插件声明了不支持的权限".to_owned());
    }
    if let Some(minimum) = &manifest.min_quickcalc_version {
        if version_tuple(minimum) > version_tuple(QUICKCALC_VERSION) {
            return Some(format!("需要 QuickCalc {minimum} 或更高版本"));
        }
    }
    None
}

fn version_tuple(version: &str) -> (u32, u32, u32) {
    let mut parts = version
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

#[cfg(test)]
mod tests {
    use super::version_tuple;
    #[test]
    fn parses_semver_prefixes() {
        assert_eq!(version_tuple("v0.2.2"), (0, 2, 2));
    }
}
