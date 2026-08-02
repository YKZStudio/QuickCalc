use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State, WebviewWindow};

use crate::{
    app_state::AppState,
    evaluator::Evaluator,
    model::{EvaluationResponse, HistoryEntry, Snapshot, HISTORY_LIMIT},
};

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub fn evaluate_expression(
    expression: String,
    state: State<'_, AppState>,
) -> Result<EvaluationResponse, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "运行状态锁已损坏".to_owned())?;
    let output = Evaluator::new(
        &runtime.variables,
        &runtime.variable_kinds,
        runtime.res,
        runtime.res_kind,
    )
    .evaluate(&expression)?;

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

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间早于 Unix epoch".to_owned())?
        .as_millis()
        .try_into()
        .map_err(|_| "系统时间超出支持范围".to_owned())?;
    let history_entry = HistoryEntry {
        id: format!("{timestamp_ms}-{}", state.next_sequence()),
        timestamp_ms,
        expression: expression.clone(),
        result: output.display.clone(),
        value: output.value,
    };

    runtime.history.insert(0, history_entry.clone());
    runtime.history.truncate(HISTORY_LIMIT);

    // The command does not return success until the new result is synced to disk.
    state.storage.save_runtime(&runtime)?;

    Ok(EvaluationResponse {
        expression,
        display: output.display,
        value: output.value,
        assigned_variable: output.assigned_variable,
        history_entry,
    })
}

#[tauri::command]
pub fn hide_main_window(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.persist_all()?;
    window.hide().map_err(|error| format!("无法隐藏窗口：{error}"))
}

#[tauri::command]
pub fn quit_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.persist_all()?;
    app.exit(0);
    Ok(())
}
