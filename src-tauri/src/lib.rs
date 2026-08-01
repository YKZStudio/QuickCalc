mod app_state;
mod commands;
mod evaluator;
mod model;
mod storage;

use app_state::AppState;
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
        Err(error) => eprintln!("failed to read QuickCalc window visibility: {error}"),
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
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            let storage = Storage::new(data_directory);
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
            app.manage(AppState::new(storage, settings, runtime));

            if let Err(error) = app.global_shortcut().register(hotkey.as_str()) {
                // A shortcut conflict must not prevent the app from starting.
                eprintln!("failed to register global shortcut {hotkey}: {error}");
            }

            if should_autostart {
                if let Err(error) = app.autolaunch().enable() {
                    eprintln!("failed to enable autostart: {error}");
                }
            } else if let Err(error) = app.autolaunch().disable() {
                eprintln!("failed to disable autostart: {error}");
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
            commands::evaluate_expression,
            commands::hide_main_window,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running QuickCalc");
}
