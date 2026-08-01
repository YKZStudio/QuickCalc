import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { applyBracketKey, completeTrailingBrackets } from "./brackets.ts";
import { normalizeExpressionInput } from "./input-normalization.ts";
import "./styles.css";

interface Settings {
  hotkey: string;
  autostart: boolean;
  historyLimit: number;
  hideOnBlur: boolean;
}

interface HistoryEntry {
  id: string;
  timestampMs: number;
  expression: string;
  result: string;
  value: number;
}

interface Snapshot {
  settings: Settings;
  history: HistoryEntry[];
  variables: Record<string, number>;
  res: number;
}

interface EvaluationResponse {
  expression: string;
  display: string;
  value: number;
  assignedVariable: string | null;
  historyEntry: HistoryEntry;
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app root element");
}

root.innerHTML = `
  <section class="shell" aria-label="QuickCalc">
    <header class="titlebar" data-tauri-drag-region>
      <div class="brand" data-tauri-drag-region>
        <span class="brand-mark" aria-hidden="true">Q</span>
        <span data-tauri-drag-region>QuickCalc</span>
      </div>
      <div class="title-actions">
        <span id="hotkey-hint" class="key-hint">Ctrl + Shift + Space</span>
        <button id="quit-button" class="icon-button" type="button" title="退出 QuickCalc" aria-label="退出 QuickCalc">×</button>
      </div>
    </header>

    <div class="workspace">
      <form id="calculator" class="calculator" autocomplete="off">
        <label class="sr-only" for="expression">表达式</label>
        <div class="input-row">
          <span class="prompt" aria-hidden="true">›</span>
          <input
            id="expression"
            name="expression"
            type="text"
            inputmode="text"
            spellcheck="false"
            maxlength="4096"
            placeholder="输入表达式，例如 2 ** 10 或 total = 99 * 1.08"
            aria-describedby="interaction-hint"
          />
        </div>
        <div id="result-panel" class="result-panel" aria-live="polite">
          <output id="result" class="result">0</output>
          <span id="status" class="status">等待输入</span>
        </div>
        <p id="interaction-hint" class="interaction-hint">Enter 计算 · 再按 Enter 复制 · Esc 隐藏</p>
      </form>

      <aside class="side-panel" aria-label="最近记录">
        <div class="side-heading">
          <span>最近计算</span>
          <span id="history-count" class="count">0 / 50</span>
        </div>
        <ol id="history" class="history"></ol>
        <div id="empty-history" class="empty-history">计算结果会自动保存在这里</div>
      </aside>
    </div>

    <footer class="footer">
      <span id="variable-summary">pi · e · res</span>
      <span>本地计算 · 自动保存</span>
    </footer>
  </section>
`;

const form = requireElement<HTMLFormElement>("#calculator");
const input = requireElement<HTMLInputElement>("#expression");
const result = requireElement<HTMLOutputElement>("#result");
const resultPanel = requireElement<HTMLElement>("#result-panel");
const status = requireElement<HTMLElement>("#status");
const historyList = requireElement<HTMLOListElement>("#history");
const historyCount = requireElement<HTMLElement>("#history-count");
const emptyHistory = requireElement<HTMLElement>("#empty-history");
const hotkeyHint = requireElement<HTMLElement>("#hotkey-hint");
const variableSummary = requireElement<HTMLElement>("#variable-summary");
const quitButton = requireElement<HTMLButtonElement>("#quit-button");

let snapshot: Snapshot = {
  settings: {
    hotkey: "Ctrl+Shift+Space",
    autostart: true,
    historyLimit: 50,
    hideOnBlur: true,
  },
  history: [],
  variables: {},
  res: 0,
};
let lastSubmittedExpression = "";
let lastDisplay: string | null = null;
let readyToCopy = false;
let busy = false;
let composing = false;
let toastTimer: number | undefined;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function formatHotkey(hotkey: string): string {
  return hotkey.split("+").join(" + ");
}

function formatTime(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestampMs));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSnapshot(): void {
  hotkeyHint.textContent = formatHotkey(snapshot.settings.hotkey);
  const variableNames = Object.keys(snapshot.variables).sort();
  variableSummary.textContent = ["pi", "e", "res", ...variableNames].join(" · ");
  historyCount.textContent = `${snapshot.history.length} / ${snapshot.settings.historyLimit}`;
  emptyHistory.hidden = snapshot.history.length > 0;

  historyList.innerHTML = snapshot.history
    .map(
      (entry) => `
        <li>
          <button class="history-item" type="button" data-expression="${escapeHtml(entry.expression)}">
            <span class="history-main">
              <span class="history-expression">${escapeHtml(entry.expression)}</span>
              <span class="history-result">${escapeHtml(entry.result)}</span>
            </span>
            <time datetime="${new Date(entry.timestampMs).toISOString()}">${formatTime(entry.timestampMs)}</time>
          </button>
        </li>
      `,
    )
    .join("");
}

function showStatus(message: string, kind: "idle" | "success" | "error" = "idle"): void {
  status.textContent = message;
  resultPanel.dataset.kind = kind;
}

function showTransientStatus(message: string): void {
  window.clearTimeout(toastTimer);
  showStatus(message, "success");
  toastTimer = window.setTimeout(() => showStatus("结果已就绪", "idle"), 1400);
}

async function evaluateCurrentExpression(): Promise<void> {
  normalizeCurrentInput();
  const completed = completeTrailingBrackets(input.value.trim());
  if (!completed || busy) {
    return;
  }

  input.value = completed;
  busy = true;
  input.disabled = true;
  showStatus("计算中…");

  try {
    const response = await invoke<EvaluationResponse>("evaluate_expression", {
      expression: completed,
    });
    result.value = response.display;
    snapshot.res = response.value;
    snapshot.history = [
      response.historyEntry,
      ...snapshot.history.filter((item) => item.id !== response.historyEntry.id),
    ].slice(0, snapshot.settings.historyLimit);
    if (response.assignedVariable) {
      snapshot.variables[response.assignedVariable] = response.value;
    }
    lastSubmittedExpression = response.expression;
    lastDisplay = response.display;
    readyToCopy = true;
    showStatus(response.assignedVariable ? `已保存变量 ${response.assignedVariable}` : "结果已就绪", "success");
    renderSnapshot();
  } catch (error) {
    lastDisplay = null;
    readyToCopy = false;
    showStatus(String(error), "error");
  } finally {
    busy = false;
    input.disabled = false;
    input.focus();
  }
}

async function copyLastResult(): Promise<void> {
  if (!lastDisplay) {
    return;
  }
  try {
    await writeText(lastDisplay);
    showTransientStatus("已复制到剪贴板");
  } catch (error) {
    showStatus(`复制失败：${String(error)}`, "error");
  }
}

async function hideWindow(): Promise<void> {
  await invoke("hide_main_window");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const unchanged = input.value.trim() === lastSubmittedExpression;
  if (readyToCopy && unchanged) {
    void copyLastResult();
    return;
  }
  void evaluateCurrentExpression();
});

function normalizeCurrentInput(): void {
  const normalized = normalizeExpressionInput(input.value);
  if (normalized === input.value) {
    return;
  }

  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  input.value = normalized;
  if (selectionStart !== null && selectionEnd !== null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

input.addEventListener("compositionstart", () => {
  composing = true;
});

input.addEventListener("compositionend", () => {
  composing = false;
  normalizeCurrentInput();
});

input.addEventListener("input", () => {
  if (!composing) {
    normalizeCurrentInput();
  }
  if (input.value.trim() !== lastSubmittedExpression) {
    readyToCopy = false;
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void hideWindow();
    return;
  }

  const edit = applyBracketKey(
    input.value,
    input.selectionStart ?? input.value.length,
    input.selectionEnd ?? input.value.length,
    normalizeExpressionInput(event.key),
  );
  if (!edit) {
    return;
  }

  event.preventDefault();
  input.value = edit.value;
  input.setSelectionRange(edit.cursor, edit.cursor);
  readyToCopy = false;
});

historyList.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-expression]");
  if (!target) {
    return;
  }
  input.value = target.dataset.expression ?? "";
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  readyToCopy = false;
});

quitButton.addEventListener("click", () => {
  void invoke("quit_app");
});

getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (focused) {
    window.setTimeout(() => input.focus(), 0);
  }
});

async function bootstrap(): Promise<void> {
  try {
    snapshot = await invoke<Snapshot>("get_snapshot");
    renderSnapshot();
    if (snapshot.history[0]) {
      result.value = snapshot.history[0].result;
    }
    showStatus("等待输入");
    input.focus();
  } catch (error) {
    showStatus(`启动失败：${String(error)}`, "error");
  }
}

void bootstrap();
