import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { applyBracketKey, completeTrailingBrackets } from "./brackets.ts";
import { createCommandRuntime, type CommandResult } from "./commands.ts";
import { createI18n } from "./i18n.ts";
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
  value: number | null;
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
  value: number | null;
  assignedVariable: string | null;
  historyEntry: HistoryEntry;
}

const i18n = createI18n();
document.documentElement.lang = i18n.locale;
document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
  "content",
  i18n.t("metaDescription"),
);

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error(i18n.t("rootMissing"));
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
        <button id="quit-button" class="icon-button" type="button" title="${escapeHtml(i18n.t("quitTitle"))}" aria-label="${escapeHtml(i18n.t("quitTitle"))}">×</button>
      </div>
    </header>

    <div class="workspace">
      <form id="calculator" class="calculator" autocomplete="off">
        <label class="sr-only" for="expression">${escapeHtml(i18n.t("expressionLabel"))}</label>
        <div class="input-row">
          <span class="prompt" aria-hidden="true">›</span>
          <input
            id="expression"
            name="expression"
            type="text"
            inputmode="text"
            spellcheck="false"
            maxlength="4096"
            placeholder="${escapeHtml(i18n.t("expressionPlaceholder"))}"
            aria-describedby="interaction-hint"
          />
        </div>
        <div id="result-panel" class="result-panel" aria-live="polite">
          <output id="result" class="result">0</output>
          <div id="command-panel" class="command-panel" hidden>
            <strong id="command-title" class="command-title"></strong>
            <ul id="command-lines" class="command-lines"></ul>
          </div>
          <span id="status" class="status">${escapeHtml(i18n.t("waiting"))}</span>
        </div>
        <p id="interaction-hint" class="interaction-hint">${escapeHtml(i18n.t("interactionHint"))}</p>
      </form>

      <aside class="side-panel" aria-label="${escapeHtml(i18n.t("recentHistory"))}">
        <div class="side-heading">
          <span>${escapeHtml(i18n.t("recentCalculations"))}</span>
          <span id="history-count" class="count">0 / 50</span>
        </div>
        <ol id="history" class="history"></ol>
        <div id="empty-history" class="empty-history">${escapeHtml(i18n.t("emptyHistory"))}</div>
      </aside>
    </div>

    <footer class="footer">
      <span id="variable-summary">pi · e · res · tmstamp · tmlocal · tmutc</span>
      <span>${escapeHtml(i18n.t("localAutoSave"))}</span>
    </footer>
  </section>
`;

const form = requireElement<HTMLFormElement>("#calculator");
const input = requireElement<HTMLInputElement>("#expression");
const result = requireElement<HTMLOutputElement>("#result");
const resultPanel = requireElement<HTMLElement>("#result-panel");
const commandPanel = requireElement<HTMLElement>("#command-panel");
const commandTitle = requireElement<HTMLElement>("#command-title");
const commandLines = requireElement<HTMLUListElement>("#command-lines");
const status = requireElement<HTMLElement>("#status");
const historyList = requireElement<HTMLOListElement>("#history");
const historyCount = requireElement<HTMLElement>("#history-count");
const emptyHistory = requireElement<HTMLElement>("#empty-history");
const hotkeyHint = requireElement<HTMLElement>("#hotkey-hint");
const variableSummary = requireElement<HTMLElement>("#variable-summary");
const quitButton = requireElement<HTMLButtonElement>("#quit-button");
const commandRuntime = createCommandRuntime(i18n);

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
    throw new Error(i18n.t("elementMissing", { selector }));
  }
  return element;
}

function formatHotkey(hotkey: string): string {
  return hotkey.split("+").join(" + ");
}

function formatTime(timestampMs: number): string {
  return new Intl.DateTimeFormat(i18n.locale, {
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
  variableSummary.textContent = [
    "pi",
    "e",
    "res",
    "tmstamp",
    "tmlocal",
    "tmutc",
    ...variableNames,
  ].join(" · ");
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
  toastTimer = window.setTimeout(() => showStatus(i18n.t("resultReady"), "idle"), 1400);
}

function showNumericResult(value: string): void {
  commandPanel.hidden = true;
  result.hidden = false;
  result.value = value;
}

function showCommandResult(response: CommandResult): void {
  result.hidden = true;
  commandPanel.hidden = false;
  commandTitle.textContent = response.title;
  commandLines.replaceChildren(
    ...response.lines.map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
  showStatus(
    i18n.t(response.tone === "error" ? "commandNotExecuted" : "commandExecuted"),
    response.tone === "error" ? "error" : response.tone === "success" ? "success" : "idle",
  );
}

async function executeCurrentCommand(command: string): Promise<void> {
  if (busy) {
    return;
  }

  busy = true;
  input.disabled = true;
  showStatus(i18n.t("runningCommand"));
  try {
    const response = await commandRuntime.execute(command);
    if (response) {
      showCommandResult(response);
    }
    lastDisplay = null;
    readyToCopy = false;
  } finally {
    busy = false;
    input.disabled = false;
    input.focus();
  }
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
  showStatus(i18n.t("calculating"));

  try {
    const response = await invoke<EvaluationResponse>("evaluate_expression", {
      expression: completed,
    });
    showNumericResult(response.display);
    if (response.value !== null) {
      snapshot.res = response.value;
    }
    snapshot.history = [
      response.historyEntry,
      ...snapshot.history.filter((item) => item.id !== response.historyEntry.id),
    ].slice(0, snapshot.settings.historyLimit);
    if (response.assignedVariable && response.value !== null) {
      snapshot.variables[response.assignedVariable] = response.value;
    }
    lastSubmittedExpression = response.expression;
    lastDisplay = response.display;
    readyToCopy = true;
    showStatus(
      response.assignedVariable
        ? i18n.t("variableSaved", { name: response.assignedVariable })
        : i18n.t("resultReady"),
      "success",
    );
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
    showTransientStatus(i18n.t("copied"));
  } catch (error) {
    showStatus(i18n.t("copyFailed", { error: String(error) }), "error");
  }
}

async function hideWindow(): Promise<void> {
  await invoke("hide_main_window");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const currentInput = input.value.trim();
  if (currentInput.startsWith("/")) {
    void executeCurrentCommand(currentInput);
    return;
  }
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
      showNumericResult(snapshot.history[0].result);
    }
    showStatus(i18n.t("waiting"));
    input.focus();
  } catch (error) {
    showStatus(i18n.t("startupFailed", { error: String(error) }), "error");
  }
}

void bootstrap();
