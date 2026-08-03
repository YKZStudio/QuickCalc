import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { applyBracketKey, completeTrailingBrackets } from "./brackets.ts";
import { createCommandRuntime, type ColorMode, type CommandResult } from "./commands.ts";
import {
  applyCompletion,
  getCompletionSuggestions,
  type CompletionCandidate,
  type CompletionSuggestion,
} from "./completion.ts";
import { createI18n } from "./i18n.ts";
import {
  createHistoryNavigationState,
  navigateHistory,
  type HistoryNavigationState,
} from "./history-navigation.ts";
import { normalizeExpressionInput } from "./input-normalization.ts";
import { resolveSubmission } from "./submission.ts";
import "./styles.css";

interface Settings {
  hotkey: string;
  autostart: boolean;
  historyLimit: number;
  hideOnBlur: boolean;
  colorMode: ColorMode;
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
  error: string | null;
  historyEntry: HistoryEntry;
}

const i18n = createI18n();
const isTauriRuntime = "__TAURI_INTERNALS__" in window;
const previewParameters = new URLSearchParams(window.location.search);
const previewTheme = previewParameters.get("theme");
if (!isTauriRuntime && (previewTheme === "light" || previewTheme === "dark")) {
  document.documentElement.dataset.colorMode = previewTheme;
}
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
      <div class="window-controls">
        <button id="hide-button" class="traffic-control traffic-control--close" type="button" title="${escapeHtml(i18n.t("hideTitle"))}" aria-label="${escapeHtml(i18n.t("hideTitle"))}">
          <i class="ph-fill ph-circle" aria-hidden="true"></i>
        </button>
        <span class="traffic-control traffic-control--hide" aria-hidden="true">
          <i class="ph-fill ph-circle" aria-hidden="true"></i>
        </span>
        <span class="traffic-control traffic-control--fixed" aria-hidden="true">
          <i class="ph-fill ph-circle"></i>
        </span>
      </div>
      <div class="brand" data-tauri-drag-region>
        <span data-tauri-drag-region>QuickCalc</span>
      </div>
      <div class="title-actions">
        <span id="hotkey-hint" class="key-hint">Ctrl + Shift + Space</span>
        <button id="quit-button" class="quit-button" type="button" title="${escapeHtml(i18n.t("quitTitle"))}">${escapeHtml(i18n.t("quitLabel"))}</button>
      </div>
    </header>

    <div class="workspace">
      <form id="calculator" class="calculator" autocomplete="off">
        <label class="sr-only" for="expression">${escapeHtml(i18n.t("expressionLabel"))}</label>
        <div class="input-stack">
          <div class="input-row">
            <i class="ph ph-caret-right prompt" aria-hidden="true"></i>
            <input
              id="expression"
              name="expression"
              type="text"
              inputmode="text"
              spellcheck="false"
              maxlength="4096"
              placeholder="${escapeHtml(i18n.t("expressionPlaceholder"))}"
              aria-describedby="interaction-hint"
              aria-autocomplete="list"
              aria-controls="completion-list"
              aria-expanded="false"
              role="combobox"
            />
          </div>
          <div id="completion-panel" class="completion-panel" hidden>
            <ul id="completion-list" class="completion-list" role="listbox"></ul>
          </div>
        </div>
        <div id="result-panel" class="result-panel" aria-live="polite">
          <output id="result" class="result">0</output>
          <div id="command-panel" class="command-panel" hidden>
            <strong id="command-title" class="command-title"></strong>
            <ul id="command-lines" class="command-lines"></ul>
          </div>
          <div class="status-row">
            <i id="status-icon" class="ph-fill ph-check-circle status-icon" aria-hidden="true" hidden></i>
            <span id="status" class="status">${escapeHtml(i18n.t("waiting"))}</span>
          </div>
        </div>
        <section class="variables-panel" aria-label="${escapeHtml(i18n.t("variables"))}">
          <div class="section-heading">${escapeHtml(i18n.t("variables"))}</div>
          <div id="variables" class="variables-list"></div>
        </section>
        <div class="interaction-hint">
          <i class="ph ph-keyboard" aria-hidden="true"></i>
          <p id="interaction-hint-text">${escapeHtml(i18n.t("interactionHint"))}</p>
        </div>
      </form>

      <aside class="side-panel" aria-label="${escapeHtml(i18n.t("recentHistory"))}">
        <div class="side-heading">
          <span>${escapeHtml(i18n.t("recentCalculations"))}</span>
          <span id="history-count" class="count">0 / 100</span>
        </div>
        <ol id="history" class="history"></ol>
        <div id="empty-history" class="empty-history">${escapeHtml(i18n.t("emptyHistory"))}</div>
        <div class="side-save">
          <i class="ph ph-cloud-arrow-down" aria-hidden="true"></i>
          <span>${escapeHtml(i18n.t("localAutoSave"))}</span>
        </div>
      </aside>
    </div>
  </section>
`;

const form = requireElement<HTMLFormElement>("#calculator");
const input = requireElement<HTMLInputElement>("#expression");
const completionPanel = requireElement<HTMLElement>("#completion-panel");
const completionList = requireElement<HTMLUListElement>("#completion-list");
const result = requireElement<HTMLOutputElement>("#result");
const resultPanel = requireElement<HTMLElement>("#result-panel");
const commandPanel = requireElement<HTMLElement>("#command-panel");
const commandTitle = requireElement<HTMLElement>("#command-title");
const commandLines = requireElement<HTMLUListElement>("#command-lines");
const status = requireElement<HTMLElement>("#status");
const statusIcon = requireElement<HTMLElement>("#status-icon");
const historyList = requireElement<HTMLOListElement>("#history");
const historyCount = requireElement<HTMLElement>("#history-count");
const emptyHistory = requireElement<HTMLElement>("#empty-history");
const variablesList = requireElement<HTMLElement>("#variables");
const hotkeyHint = requireElement<HTMLElement>("#hotkey-hint");
const quitButton = requireElement<HTMLButtonElement>("#quit-button");
const hideButton = requireElement<HTMLButtonElement>("#hide-button");
const titlebar = requireElement<HTMLElement>(".titlebar");
const sidePanel = requireElement<HTMLElement>(".side-panel");
const commandRuntime = createCommandRuntime(i18n, {
  cleanHistory,
  deleteVariable,
  getColorMode: () => snapshot.settings.colorMode,
  setColorMode,
});

let snapshot: Snapshot = {
  settings: {
    hotkey: "Ctrl+Shift+Space",
    autostart: true,
    historyLimit: 100,
    hideOnBlur: true,
    colorMode: "auto",
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
let completionSuggestions: CompletionSuggestion[] = [];
let activeCompletionIndex = 0;
let historyNavigation: HistoryNavigationState = createHistoryNavigationState();
let resizeFrame = 0;
let resizeGeneration = 0;

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

function formatDateTime(date: Date, utc = false): string {
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day = utc ? date.getUTCDate() : date.getDate();
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function applyColorMode(mode: ColorMode): void {
  if (mode === "auto") {
    delete document.documentElement.dataset.colorMode;
  } else {
    document.documentElement.dataset.colorMode = mode;
  }
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
  const now = new Date();
  const variableEntries: Array<[string, string, boolean]> = [
    ["pi", String(Math.PI), false],
    ["e", String(Math.E), false],
    ["res", String(snapshot.res), false],
    ["tmstamp", String(Math.floor(now.getTime() / 1000)), false],
    ["tmlocal", formatDateTime(now), false],
    ["tmutc", formatDateTime(now, true), false],
    ...Object.keys(snapshot.variables)
      .sort()
      .map((name): [string, string, boolean] => [name, String(snapshot.variables[name]), true]),
  ];
  variablesList.innerHTML = variableEntries
    .map(
      ([name, value, canDelete]) => `
        <div class="variable-row">
          <span>${escapeHtml(name)}</span>
          <span class="variable-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
          ${
            canDelete
              ? `<button class="variable-delete" type="button" data-delete-variable="${escapeHtml(name)}" title="${escapeHtml(i18n.t("deleteVariableTitle", { name }))}" aria-label="${escapeHtml(i18n.t("deleteVariableTitle", { name }))}"><i class="ph ph-trash" aria-hidden="true"></i></button>`
              : ""
          }
        </div>
      `,
    )
    .join("");
  historyCount.textContent = `${snapshot.history.length} / ${snapshot.settings.historyLimit}`;
  emptyHistory.hidden = snapshot.history.length > 0;

  historyList.innerHTML = snapshot.history
    .map(
      (entry, index) => `
        <li>
          <button class="history-item${index === 0 ? " is-current" : ""}" type="button" data-expression="${escapeHtml(entry.expression)}">
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
  queueWindowFit();
}

function queueWindowFit(): void {
  if (!isTauriRuntime) {
    return;
  }
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => void fitWindowToContent());
}

async function fitWindowToContent(): Promise<void> {
  const generation = ++resizeGeneration;
  const appWindow = getCurrentWindow();
  const scaleFactor = await appWindow.scaleFactor();
  const physicalSize = await appWindow.innerSize();
  const physicalPosition = await appWindow.outerPosition();
  const currentWidth = physicalSize.width / scaleFactor;
  const currentHeight = physicalSize.height / scaleFactor;
  const contentHeight = titlebar.offsetHeight + Math.max(form.scrollHeight, sidePanel.scrollHeight) + 2;
  let targetHeight = Math.min(860, Math.max(460, Math.ceil(contentHeight)));
  const monitor = await currentMonitor();
  if (monitor) {
    const availableBelow =
      (monitor.workArea.position.y + monitor.workArea.size.height - physicalPosition.y) /
        scaleFactor -
      12;
    targetHeight = Math.min(targetHeight, Math.max(460, availableBelow));
  }
  if (targetHeight <= currentHeight + 1 || generation !== resizeGeneration) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    await appWindow.setSize(new LogicalSize(currentWidth, targetHeight));
    return;
  }

  const duration = 320;
  const startedAt = performance.now();
  const animate = async (timestamp: number): Promise<void> => {
    if (generation !== resizeGeneration) {
      return;
    }
    const progress = Math.min(1, (timestamp - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    const height = currentHeight + (targetHeight - currentHeight) * eased;
    await appWindow.setSize(new LogicalSize(currentWidth, height));
    if (progress < 1 && generation === resizeGeneration) {
      window.requestAnimationFrame((nextTimestamp) => void animate(nextTimestamp));
    }
  };
  window.requestAnimationFrame((timestamp) => void animate(timestamp));
}

function showStatus(message: string, kind: "idle" | "success" | "error" = "idle"): void {
  status.textContent = message;
  resultPanel.dataset.kind = kind;
  statusIcon.hidden = kind === "idle";
  statusIcon.className = `ph-fill ${kind === "error" ? "ph-warning-circle" : "ph-check-circle"} status-icon`;
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
  result.dataset.size =
    value.length <= 12 ? "regular" : value.length <= 20 ? "compact" : value.length <= 32 ? "dense" : "wrap";
}

function variableCandidates(): CompletionCandidate[] {
  return [
    { name: "pi", description: i18n.t("completionPi") },
    { name: "e", description: i18n.t("completionE") },
    { name: "res", description: i18n.t("completionRes") },
    { name: "tmstamp", description: i18n.t("completionTimestamp") },
    { name: "tmlocal", description: i18n.t("completionLocalTime") },
    { name: "tmutc", description: i18n.t("completionUtcTime") },
    ...Object.keys(snapshot.variables).map((name) => ({
      name,
      description: i18n.t("completionUserVariable"),
    })),
  ];
}

function commandCandidates(): CompletionCandidate[] {
  return commandRuntime.commands.list().map((command) => ({
    name: command.name,
    description: command.summary,
  }));
}

function operationCandidates(): CompletionCandidate[] {
  return [
    { name: "ascii", description: i18n.t("completionAscii") },
    { name: "base64", description: i18n.t("completionBase64") },
    { name: "bin", description: i18n.t("completionBin") },
    { name: "dec", description: i18n.t("completionDec") },
    { name: "dex", description: i18n.t("completionDec") },
    { name: "hex", description: i18n.t("completionHex") },
    { name: "oct", description: i18n.t("completionOct") },
    { name: "tostr", description: i18n.t("completionToString") },
  ];
}

function refreshCompletions(): void {
  completionSuggestions = getCompletionSuggestions(
    input.value,
    input.selectionStart ?? input.value.length,
    variableCandidates(),
    commandCandidates(),
    operationCandidates(),
  );
  activeCompletionIndex = 0;
  renderCompletions();
}

function renderCompletions(): void {
  const hasSuggestions = completionSuggestions.length > 0;
  completionPanel.hidden = !hasSuggestions;
  input.setAttribute("aria-expanded", String(hasSuggestions));
  input.removeAttribute("aria-activedescendant");

  completionList.replaceChildren(
    ...completionSuggestions.map((suggestion, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const id = `completion-${index}`;
      button.id = id;
      button.className = "completion-item";
      button.type = "button";
      button.dataset.completionIndex = String(index);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === activeCompletionIndex));
      const description =
        suggestion.description ??
        i18n.t(
          suggestion.kind === "command"
            ? "completionCommand"
            : suggestion.kind === "operation"
              ? "completionOperation"
              : "completionVariable",
        );
      button.innerHTML = `<span>${escapeHtml(suggestion.label)}</span><small>${escapeHtml(description)}</small>`;
      if (index === activeCompletionIndex) {
        input.setAttribute("aria-activedescendant", id);
      }
      item.append(button);
      return item;
    }),
  );
}

function acceptCompletion(index = activeCompletionIndex): boolean {
  const suggestion = completionSuggestions[index];
  if (!suggestion) {
    return false;
  }
  const edit = applyCompletion(input.value, suggestion);
  input.value = edit.value;
  input.setSelectionRange(edit.cursor, edit.cursor);
  historyNavigation = createHistoryNavigationState();
  readyToCopy = false;
  refreshCompletions();
  return true;
}

function dismissCompletions(): void {
  completionSuggestions = [];
  activeCompletionIndex = 0;
  renderCompletions();
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
  queueWindowFit();
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

async function evaluateCurrentExpression(expression: string): Promise<void> {
  const completed = completeTrailingBrackets(expression.trim());
  if (!completed || busy) {
    return;
  }

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
    lastDisplay = response.error ? null : response.display;
    readyToCopy = response.error === null;
    if (response.error) {
      showStatus(response.error, "error");
    } else {
      showStatus(
        response.assignedVariable
          ? i18n.t("variableSaved", { name: response.assignedVariable })
          : i18n.t("resultReady"),
        "success",
      );
    }
    renderSnapshot();
  } catch (error) {
    lastDisplay = null;
    readyToCopy = false;
    showNumericResult(String(error));
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

async function cleanHistory(): Promise<number> {
  const removed = isTauriRuntime
    ? await invoke<number>("clean_history")
    : snapshot.history.length;
  snapshot.history = [];
  renderSnapshot();
  return removed;
}

async function deleteVariable(name: string): Promise<boolean> {
  const deleted = isTauriRuntime
    ? await invoke<boolean>("delete_variable", { name })
    : Object.hasOwn(snapshot.variables, name);
  if (deleted) {
    delete snapshot.variables[name];
    renderSnapshot();
  }
  return deleted;
}

async function setColorMode(mode: ColorMode): Promise<void> {
  if (isTauriRuntime) {
    await invoke<ColorMode>("set_color_mode", { mode });
  }
  snapshot.settings.colorMode = mode;
  applyColorMode(mode);
  queueWindowFit();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  normalizeCurrentInput();
  const action = resolveSubmission(input.value, readyToCopy);
  if (action.kind === "none") {
    return;
  }
  if (action.kind === "copy") {
    void copyLastResult();
    return;
  }

  historyNavigation = createHistoryNavigationState();
  input.value = "";
  dismissCompletions();
  if (action.kind === "command") {
    void executeCurrentCommand(action.value);
    return;
  }
  void evaluateCurrentExpression(action.value);
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
  historyNavigation = createHistoryNavigationState();
  if (!composing) {
    normalizeCurrentInput();
  }
  if (input.value.trim() !== lastSubmittedExpression) {
    readyToCopy = false;
  }
  refreshCompletions();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && completionSuggestions.length > 0) {
    event.preventDefault();
    acceptCompletion();
    return;
  }

  if (
    event.altKey &&
    (event.key === "ArrowDown" || event.key === "ArrowUp") &&
    completionSuggestions.length > 0
  ) {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeCompletionIndex =
      (activeCompletionIndex + direction + completionSuggestions.length) %
      completionSuggestions.length;
    renderCompletions();
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const navigation = navigateHistory(
      input.value,
      snapshot.history.map((entry) => entry.expression),
      event.key === "ArrowUp" ? "older" : "newer",
      historyNavigation,
    );
    if (navigation) {
      event.preventDefault();
      historyNavigation = navigation.state;
      input.value = navigation.value;
      input.setSelectionRange(input.value.length, input.value.length);
      readyToCopy = false;
      dismissCompletions();
      return;
    }
  }

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
  historyNavigation = createHistoryNavigationState();
  readyToCopy = false;
  refreshCompletions();
});

completionList.addEventListener("mousedown", (event) => {
  event.preventDefault();
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-completion-index]");
  if (!target) {
    return;
  }
  acceptCompletion(Number(target.dataset.completionIndex));
  input.focus();
});

historyList.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-expression]");
  if (!target) {
    return;
  }
  input.value = target.dataset.expression ?? "";
  historyNavigation = createHistoryNavigationState();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  readyToCopy = false;
  refreshCompletions();
});

quitButton.addEventListener("click", () => {
  void invoke("quit_app");
});

variablesList.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-delete-variable]",
  );
  const name = target?.dataset.deleteVariable;
  if (!name) {
    return;
  }
  void executeCurrentCommand(`/del ${name}`);
});

hideButton.addEventListener("click", () => {
  void hideWindow();
});

if (isTauriRuntime) {
  getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) {
      window.setTimeout(() => {
        input.value = "";
        historyNavigation = createHistoryNavigationState();
        lastSubmittedExpression = "";
        readyToCopy = false;
        dismissCompletions();
        input.focus();
      }, 0);
    }
  });
}

async function bootstrap(): Promise<void> {
  if (!isTauriRuntime) {
    if (previewTheme !== "light" && previewTheme !== "dark") {
      applyColorMode(snapshot.settings.colorMode);
    }
    if (previewParameters.get("preview") === "design") {
      const now = new Date("2026-08-03T10:42:00+08:00").getTime();
      snapshot = {
        ...snapshot,
        res: 216.91,
        variables: { tax: 0.09 },
        history: [
          { id: "preview-1", timestampMs: now, expression: "199 * (1 + tax)", result: "216.91", value: 216.91 },
          { id: "preview-2", timestampMs: now - 60_000, expression: "15% of 199", result: "29.85", value: 29.85 },
          { id: "preview-3", timestampMs: now - 180_000, expression: "sqrt(144) + 2^3", result: "20", value: 20 },
        ],
      };
      input.value = "199 * (1 + tax)";
      renderSnapshot();
      showNumericResult("216.91");
      showStatus(i18n.t("resultReady"), "success");
      input.focus();
      return;
    }
    renderSnapshot();
    if (previewParameters.get("preview") === "long-result") {
      showNumericResult("2026-08-02 19:17:28");
      showStatus(i18n.t("resultReady"), "success");
    } else {
      showStatus(i18n.t("waiting"));
    }
    input.focus();
    return;
  }

  try {
    snapshot = await invoke<Snapshot>("get_snapshot");
    applyColorMode(snapshot.settings.colorMode);
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
