use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub const HISTORY_LIMIT: usize = 100;
pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+Space";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ColorMode {
    #[default]
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub autostart: bool,
    pub history_limit: usize,
    pub hide_on_blur: bool,
    pub color_mode: ColorMode,
    pub precision: u8,
    pub font_family: String,
    pub auto_update: bool,
    pub onboarding_completed: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.to_owned(),
            autostart: true,
            history_limit: HISTORY_LIMIT,
            hide_on_blur: true,
            color_mode: ColorMode::Auto,
            precision: 12,
            font_family: "system".to_owned(),
            auto_update: true,
            onboarding_completed: false,
        }
    }
}

impl Settings {
    pub fn normalize(mut self) -> Self {
        if self.hotkey.trim().is_empty() {
            self.hotkey = DEFAULT_HOTKEY.to_owned();
        }
        // Product requirement: persisted history is always migrated to the current limit.
        self.history_limit = HISTORY_LIMIT;
        self.precision = self.precision.clamp(0, 15);
        if self.font_family.trim().is_empty() {
            self.font_family = "system".to_owned();
        }
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp_ms: u64,
    pub expression: String,
    pub result: String,
    #[serde(default)]
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueKind {
    #[default]
    Number,
    UnixTimestamp,
    LocalDateTime,
    UtcDateTime,
    Duration,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RuntimeData {
    pub history: Vec<HistoryEntry>,
    pub variables: HashMap<String, f64>,
    pub variable_kinds: HashMap<String, ValueKind>,
    pub res: f64,
    pub res_kind: ValueKind,
}

impl RuntimeData {
    pub fn normalize(mut self) -> Self {
        self.history.truncate(HISTORY_LIMIT);
        self.variables
            .retain(|name, value| !is_builtin(name) && value.is_finite());
        let variables = &self.variables;
        self.variable_kinds
            .retain(|name, _| variables.contains_key(name));
        if !self.res.is_finite() {
            self.res = 0.0;
            self.res_kind = ValueKind::Number;
        }
        self
    }

    pub fn delete_user_variable(&mut self, name: &str) -> bool {
        let normalized = name.trim().to_ascii_lowercase();
        if is_builtin(&normalized) {
            return false;
        }
        self.variable_kinds.remove(&normalized);
        self.variables.remove(&normalized).is_some()
    }
}

pub fn is_builtin(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "pi" | "e" | "res" | "tmstamp" | "tmlocal" | "tmutc"
    )
}

#[cfg(test)]
mod tests {
    use super::{ColorMode, RuntimeData, Settings, ValueKind, HISTORY_LIMIT};

    #[test]
    fn settings_migrate_to_the_current_history_limit_and_default_color_mode() {
        let settings: Settings = serde_json::from_str(
            r#"{"hotkey":"Ctrl+Shift+Space","autostart":true,"historyLimit":50,"hideOnBlur":true}"#,
        )
        .expect("legacy settings should deserialize");
        let settings = settings.normalize();

        assert_eq!(settings.history_limit, HISTORY_LIMIT);
        assert_eq!(settings.color_mode, ColorMode::Auto);
        assert!(!settings.onboarding_completed);
    }

    #[test]
    fn runtime_history_is_bounded_to_one_hundred_entries() {
        let mut runtime = RuntimeData::default();
        runtime.history = (0..125)
            .map(|index| super::HistoryEntry {
                id: index.to_string(),
                timestamp_ms: index,
                expression: index.to_string(),
                result: index.to_string(),
                value: Some(index as f64),
            })
            .collect();

        assert_eq!(runtime.normalize().history.len(), HISTORY_LIMIT);
    }

    #[test]
    fn runtime_deletes_user_variables_and_their_kinds_but_not_builtins() {
        let mut runtime = RuntimeData::default();
        runtime.variables.insert("tax".to_owned(), 0.09);
        runtime
            .variable_kinds
            .insert("tax".to_owned(), ValueKind::Number);

        assert!(!runtime.delete_user_variable("pi"));
        assert!(runtime.delete_user_variable("TAX"));
        assert!(!runtime.variables.contains_key("tax"));
        assert!(!runtime.variable_kinds.contains_key("tax"));
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub settings: Settings,
    pub history: Vec<HistoryEntry>,
    pub variables: HashMap<String, f64>,
    pub res: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationResponse {
    pub expression: String,
    pub display: String,
    pub value: Option<f64>,
    pub assigned_variable: Option<String>,
    pub error: Option<String>,
    pub history_entry: HistoryEntry,
}
