mod app_state;
mod commands;
mod evaluator;
mod i18n;
mod model;
mod plugins;
mod storage;

use app_state::AppState;
use i18n::{tr, Locale};
use model::Settings;
use storage::Storage;
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn persist_and_hide(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        let _ = state.persist_all();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    match window.is_visible() {
        Ok(true) => persist_and_hide(app),
        Ok(false) => {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
        }
        Err(error) => {
            let locale = app
                .try_state::<AppState>()
                .map(|state| state.locale)
                .unwrap_or_else(Locale::system);
            eprintln!(
                "{}",
                tr!(locale;
                    format!("无法读取 QuickCalc 窗口可见状态：{error}"),
                    format!("無法讀取 QuickCalc 視窗顯示狀態：{error}"),
                    format!("Failed to read QuickCalc window visibility: {error}"),
                )
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .arg("--autostart")
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            let _ = window.show();
            let _ = window.set_focus();
        }))
        .setup(|app| {
            let locale = Locale::system();
            let data_directory = app.path().app_data_dir()?;
            let storage = Storage::new(data_directory, locale);
            let settings: Settings = storage.load_settings();
            let runtime = storage.load_runtime();

            // Materialize defaults on first launch so settings always have a durable file.
            storage
                .save_settings(&settings)
                .map_err(std::io::Error::other)?;
            storage
                .save_runtime(&runtime)
                .map_err(std::io::Error::other)?;

            let hotkey = settings.hotkey.clone();
            let should_autostart = settings.autostart;
            app.manage(AppState::new(storage, settings, runtime, locale));

            if let Err(error) = app.global_shortcut().register(hotkey.as_str()) {
                // A shortcut conflict must not prevent the app from starting.
                eprintln!(
                    "{}",
                    tr!(locale;
                        format!("无法注册全局快捷键 {hotkey}：{error}"),
                        format!("無法註冊全域快速鍵 {hotkey}：{error}"),
                        format!("Failed to register global shortcut {hotkey}: {error}"),
                    )
                );
            }

            if should_autostart {
                if let Err(error) = app.autolaunch().enable() {
                    eprintln!(
                        "{}",
                        tr!(locale;
                            format!("无法启用开机自启动：{error}"),
                            format!("無法啟用開機自動啟動：{error}"),
                            format!("Failed to enable autostart: {error}"),
                        )
                    );
                }
            } else if let Err(error) = app.autolaunch().disable() {
                eprintln!(
                    "{}",
                    tr!(locale;
                        format!("无法停用开机自启动：{error}"),
                        format!("無法停用開機自動啟動：{error}"),
                        format!("Failed to disable autostart: {error}"),
                    )
                );
            }

            let launched_by_autostart = std::env::args().any(|argument| argument == "--autostart");
            if !launched_by_autostart {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                    window.set_focus()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) => {
                let state = window.state::<AppState>();
                if state.hide_on_blur() {
                    let _ = state.persist_all();
                    let _ = window.hide();
                }
            }
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let state = window.state::<AppState>();
                let _ = state.persist_all();
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::clean_history,
            commands::delete_variable,
            commands::set_color_mode,
            commands::complete_onboarding,
            commands::update_settings,
            commands::list_plugins,
            commands::evaluate_expression,
            commands::hide_main_window,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            let locale = Locale::system();
            panic!(
                "{}",
                tr!(locale;
                    format!("QuickCalc 运行失败：{error}"),
                    format!("QuickCalc 執行失敗：{error}"),
                    format!("QuickCalc failed to run: {error}"),
                )
            );
        });
}
