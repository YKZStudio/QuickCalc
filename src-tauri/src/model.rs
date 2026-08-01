use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub const HISTORY_LIMIT: usize = 50;
pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+Space";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub autostart: bool,
    pub history_limit: usize,
    pub hide_on_blur: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.to_owned(),
            autostart: true,
            history_limit: HISTORY_LIMIT,
            hide_on_blur: true,
        }
    }
}

impl Settings {
    pub fn normalize(mut self) -> Self {
        if self.hotkey.trim().is_empty() {
            self.hotkey = DEFAULT_HOTKEY.to_owned();
        }
        // Product requirement: the persisted history is bounded to exactly 50 entries.
        self.history_limit = HISTORY_LIMIT;
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
    pub value: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RuntimeData {
    pub history: Vec<HistoryEntry>,
    pub variables: HashMap<String, f64>,
    pub res: f64,
}

impl RuntimeData {
    pub fn normalize(mut self) -> Self {
        self.history.truncate(HISTORY_LIMIT);
        self.variables
            .retain(|name, value| !is_builtin(name) && value.is_finite());
        if !self.res.is_finite() {
            self.res = 0.0;
        }
        self
    }
}

pub fn is_builtin(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(), "pi" | "e" | "res")
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
    pub value: f64,
    pub assigned_variable: Option<String>,
    pub history_entry: HistoryEntry,
}

