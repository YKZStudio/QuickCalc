use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::{
    app_state::AppState,
    evaluator::Evaluator,
    i18n::{tr, Locale},
    model::{
        is_builtin, ColorMode, EvaluationResponse, HistoryEntry, RuntimeData, Snapshot,
        HISTORY_LIMIT,
    },
};

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub fn list_plugins() -> Vec<crate::plugins::PluginDescriptor> {
    crate::plugins::discover()
}

#[tauri::command]
pub fn clean_history(state: State<'_, AppState>) -> Result<usize, String> {
    let locale = state.locale;
    let mut runtime = state.runtime.lock().map_err(|_| {
        locale
            .text(
                "运行状态锁已损坏",
                "執行階段狀態鎖已損壞",
                "The runtime state lock is corrupted",
            )
            .to_owned()
    })?;
    let removed = runtime.history.len();
    let mut updated = runtime.clone();
    updated.history.clear();
    state.storage.save_runtime(&updated)?;
    *runtime = updated;
    Ok(removed)
}

#[tauri::command]
pub fn set_color_mode(mode: ColorMode, state: State<'_, AppState>) -> Result<ColorMode, String> {
    let locale = state.locale;
    let mut settings = state.settings.lock().map_err(|_| {
        locale
            .text(
                "设置状态锁已损坏",
                "設定狀態鎖已損壞",
                "The settings state lock is corrupted",
            )
            .to_owned()
    })?;
    let mut updated = settings.clone();
    updated.color_mode = mode;
    state.storage.save_settings(&updated)?;
    *settings = updated;
    Ok(mode)
}

#[tauri::command]
pub fn complete_onboarding(state: State<'_, AppState>) -> Result<crate::model::Settings, String> {
    let mut settings = state
        .settings
        .lock()
        .map_err(|_| "The settings state lock is corrupted".to_owned())?;
    if !settings.onboarding_completed {
        let mut updated = settings.clone();
        updated.onboarding_completed = true;
        state.storage.save_settings(&updated)?;
        *settings = updated;
    }
    Ok(settings.clone())
}

#[tauri::command]
pub fn delete_variable(name: String, state: State<'_, AppState>) -> Result<bool, String> {
    let locale = state.locale;
    let normalized = name.trim().to_ascii_lowercase();
    if is_builtin(&normalized) {
        return Err(locale
            .text(
                "内置变量或常量不可删除",
                "內建變數或常數不可刪除",
                "Built-in variables and constants cannot be deleted",
            )
            .to_owned());
    }

    let mut runtime = state.runtime.lock().map_err(|_| {
        locale
            .text(
                "运行状态锁已损坏",
                "執行階段狀態鎖已損壞",
                "The runtime state lock is corrupted",
            )
            .to_owned()
    })?;
    if !runtime.variables.contains_key(&normalized) {
        return Ok(false);
    }

    let mut updated = runtime.clone();
    updated.delete_user_variable(&normalized);
    state.storage.save_runtime(&updated)?;
    *runtime = updated;
    Ok(true)
}

#[tauri::command]
pub fn evaluate_expression(
    expression: String,
    state: State<'_, AppState>,
) -> Result<EvaluationResponse, String> {
    let locale = state.locale;
    let precision = state
        .settings
        .lock()
        .map_err(|_| "The settings state lock is corrupted".to_owned())?
        .precision;
    let mut runtime = state.runtime.lock().map_err(|_| {
        locale
            .text(
                "运行状态锁已损坏",
                "執行階段狀態鎖已損壞",
                "The runtime state lock is corrupted",
            )
            .to_owned()
    })?;
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            locale
                .text(
                    "系统时间早于 Unix epoch",
                    "系統時間早於 Unix epoch",
                    "The system clock is earlier than the Unix epoch",
                )
                .to_owned()
        })?
        .as_millis()
        .try_into()
        .map_err(|_| {
            locale
                .text(
                    "系统时间超出支持范围",
                    "系統時間超出支援範圍",
                    "The system time is outside the supported range",
                )
                .to_owned()
        })?;
    let response = evaluate_and_record(
        expression,
        &mut runtime,
        locale,
        timestamp_ms,
        format!("{timestamp_ms}-{}", state.next_sequence()),
        precision,
    );

    // The command does not return success until the new result is synced to disk.
    state.storage.save_runtime(&runtime)?;

    Ok(response)
}

fn evaluate_and_record(
    expression: String,
    runtime: &mut RuntimeData,
    locale: Locale,
    timestamp_ms: u64,
    id: String,
    precision: u8,
) -> EvaluationResponse {
    let evaluation = Evaluator::new(
        &runtime.variables,
        &runtime.variable_kinds,
        runtime.res,
        runtime.res_kind,
        locale,
        precision,
    )
    .evaluate(&expression);

    let (display, value, assigned_variable, error) = match evaluation {
        Ok(output) => {
            if let Some(value) = output.value {
                if let Some(name) = &output.assigned_variable {
                    runtime.variables.insert(name.clone(), value);
                    runtime
                        .variable_kinds
                        .insert(name.clone(), output.value_kind);
                }
                runtime.res = value;
                runtime.res_kind = output.value_kind;
            }
            (output.display, output.value, output.assigned_variable, None)
        }
        Err(error) => (error.clone(), None, None, Some(error)),
    };
    let history_entry = HistoryEntry {
        id,
        timestamp_ms,
        expression: expression.clone(),
        result: display.clone(),
        value,
    };
    runtime.history.insert(0, history_entry.clone());
    runtime.history.truncate(HISTORY_LIMIT);

    EvaluationResponse {
        expression,
        display,
        value,
        assigned_variable,
        error,
        history_entry,
    }
}

#[tauri::command]
pub fn update_settings(
    hotkey: String,
    autostart: bool,
    hide_on_blur: bool,
    precision: u8,
    font_family: String,
    auto_update: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::model::Settings, String> {
    let mut settings = state
        .settings
        .lock()
        .map_err(|_| "The settings state lock is corrupted".to_owned())?;
    let mut updated = settings.clone();
    let hotkey = hotkey.trim().to_owned();
    if hotkey.is_empty() {
        return Err("快捷键不能为空".to_owned());
    }
    if updated.hotkey != hotkey {
        app.global_shortcut()
            .unregister_all()
            .map_err(|error| format!("无法释放旧快捷键：{error}"))?;
        if let Err(error) = app.global_shortcut().register(hotkey.as_str()) {
            let _ = app.global_shortcut().register(updated.hotkey.as_str());
            return Err(format!("无法注册快捷键 {hotkey}：{error}"));
        }
        updated.hotkey = hotkey;
    }
    updated.autostart = autostart;
    updated.hide_on_blur = hide_on_blur;
    updated.precision = precision.clamp(0, 15);
    updated.font_family = font_family.trim().to_owned();
    updated.auto_update = auto_update;
    updated = updated.normalize();
    if updated.autostart {
        app.autolaunch()
            .enable()
            .map_err(|error| format!("无法启用开机自启动：{error}"))?;
    } else {
        app.autolaunch()
            .disable()
            .map_err(|error| format!("无法停用开机自启动：{error}"))?;
    }
    state.storage.save_settings(&updated)?;
    *settings = updated.clone();
    Ok(updated)
}

#[tauri::command]
pub fn hide_main_window(window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    state.persist_all()?;
    window.hide().map_err(|error| {
        tr!(state.locale;
            format!("无法隐藏窗口：{error}"),
            format!("無法隱藏視窗：{error}"),
            format!("Failed to hide the window: {error}"),
        )
    })
}

#[tauri::command]
pub fn quit_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.persist_all()?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::evaluate_and_record;
    use crate::{i18n::Locale, model::RuntimeData};

    #[test]
    fn evaluation_errors_are_returned_and_recorded_in_history() {
        let mut runtime = RuntimeData::default();
        let response = evaluate_and_record(
            "1 +".to_owned(),
            &mut runtime,
            Locale::ZhCn,
            123,
            "error-1".to_owned(),
            12,
        );

        assert!(response.error.is_some());
        assert_eq!(response.value, None);
        assert_eq!(response.display, response.error.unwrap());
        assert_eq!(runtime.history.len(), 1);
        assert_eq!(runtime.history[0].expression, "1 +");
        assert_eq!(runtime.history[0].result, response.display);
        assert_eq!(runtime.res, 0.0);
    }
}
