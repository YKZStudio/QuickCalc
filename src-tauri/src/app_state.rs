use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use crate::{
    i18n::Locale,
    model::{RuntimeData, Settings, Snapshot},
    storage::Storage,
};

#[derive(Debug)]
pub struct AppState {
    pub storage: Storage,
    pub settings: Mutex<Settings>,
    pub runtime: Mutex<RuntimeData>,
    pub locale: Locale,
    sequence: AtomicU64,
}

impl AppState {
    pub fn new(
        storage: Storage,
        settings: Settings,
        runtime: RuntimeData,
        locale: Locale,
    ) -> Self {
        Self {
            storage,
            settings: Mutex::new(settings),
            runtime: Mutex::new(runtime),
            locale,
            sequence: AtomicU64::new(0),
        }
    }

    pub fn snapshot(&self) -> Result<Snapshot, String> {
        let settings = self
            .settings
            .lock()
            .map_err(|_| {
                self.locale
                    .text(
                        "设置状态锁已损坏",
                        "設定狀態鎖已損壞",
                        "The settings state lock is corrupted",
                    )
                    .to_owned()
            })?
            .clone();
        let runtime = self
            .runtime
            .lock()
            .map_err(|_| {
                self.locale
                    .text(
                        "运行状态锁已损坏",
                        "執行階段狀態鎖已損壞",
                        "The runtime state lock is corrupted",
                    )
                    .to_owned()
            })?
            .clone();

        Ok(Snapshot {
            settings,
            history: runtime.history,
            variables: runtime.variables,
            res: runtime.res,
        })
    }

    pub fn hide_on_blur(&self) -> bool {
        self.settings
            .lock()
            .map(|settings| settings.hide_on_blur)
            .unwrap_or(true)
    }

    pub fn next_sequence(&self) -> u64 {
        self.sequence.fetch_add(1, Ordering::Relaxed)
    }

    pub fn persist_all(&self) -> Result<(), String> {
        let settings = self
            .settings
            .lock()
            .map_err(|_| {
                self.locale
                    .text(
                        "设置状态锁已损坏",
                        "設定狀態鎖已損壞",
                        "The settings state lock is corrupted",
                    )
                    .to_owned()
            })?
            .clone();
        let runtime = self
            .runtime
            .lock()
            .map_err(|_| {
                self.locale
                    .text(
                        "运行状态锁已损坏",
                        "執行階段狀態鎖已損壞",
                        "The runtime state lock is corrupted",
                    )
                    .to_owned()
            })?
            .clone();
        self.storage.save_settings(&settings)?;
        self.storage.save_runtime(&runtime)
    }
}
