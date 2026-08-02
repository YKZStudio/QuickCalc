export const SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en-US"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const enUS = {
  metaDescription: "QuickCalc fast desktop calculator",
  rootMissing: "Missing #app root element",
  elementMissing: "Missing required element: {selector}",
  quitTitle: "Quit QuickCalc",
  expressionLabel: "Expression",
  expressionPlaceholder: "Enter an expression or /help, e.g. 0b1010.oct",
  waiting: "Waiting for input",
  interactionHint: "Enter calculate · /help help · Enter again to copy · Esc hide",
  recentHistory: "Recent history",
  recentCalculations: "Recent calculations",
  emptyHistory: "Results are saved here automatically",
  localAutoSave: "Local calculation · Auto-save",
  resultReady: "Result ready",
  commandNotExecuted: "Command not executed",
  commandExecuted: "Command executed",
  runningCommand: "Running command…",
  calculating: "Calculating…",
  variableSaved: "Saved variable {name}",
  copied: "Copied to clipboard",
  copyFailed: "Copy failed: {error}",
  startupFailed: "Startup failed: {error}",
  commandNameInvalid:
    "Command names must start with a letter and contain only letters, numbers, or hyphens",
  commandAlreadyRegistered: "Command /{name} is already registered",
  commandEmpty: "Command cannot be empty",
  helpHint: "Enter /help to see available commands.",
  unknownCommand: "Unknown command: /{name}",
  commandExecutionFailed: "Command /{name} failed",
  helpSummary: "Show usage, help, or details for a command",
  helpUsage: "/help [command]",
  commandNotFound: "Command not found: /{name}",
  usageLine: "Usage: {usage}",
  helpTitle: "QuickCalc Help",
  helpExpression:
    "Expressions: press Enter to evaluate; press Enter again without changing the expression to copy the result.",
  helpBaseConversion:
    "Base conversion: use expression.base, for example 0b1010.oct or 12345.6789.hex.",
  helpTime:
    "Time: tmstamp is the Unix timestamp in seconds; tmlocal and tmutc show local time and UTC and can be saved for subtraction.",
  helpAscii:
    "ASCII: Hello.ascii converts text to codes; 72 101 108 108 111.tostr converts codes back to text.",
  pluginSummary: "List, enable, disable, or remove loaded plugins",
  pluginUsage: "/plugin [list|enable <id>|disable <id>|remove <id>|help]",
  pluginHelpTitle: "Plugin Management Help",
  pluginListHelp: "/plugin list — List loaded plugins",
  pluginEnableHelp: "/plugin enable <id> — Enable a plugin",
  pluginDisableHelp: "/plugin disable <id> — Disable a plugin",
  pluginRemoveHelp: "/plugin remove <id> — Remove a plugin",
  pluginHostHelp:
    "The plugin host can connect trusted plugins through the QuickCalcPlugin interface and PluginManager.install().",
  pluginManagementTitle: "Plugin Management",
  pluginEnabled: "Enabled",
  pluginDisabled: "Disabled",
  noPlugins: "No plugins are currently loaded.",
  pluginHelpHint: "Enter /plugin help to see management commands.",
  unknownPluginAction: "Unknown plugin action: {action}",
  missingPluginId: "Plugin ID is required",
  pluginActionUsage: "Usage: /plugin {action} <id>",
  pluginNotFound: "Plugin not found: {id}",
  pluginListHint: "Enter /plugin list to see loaded plugins.",
  pluginEnabledTitle: "Plugin enabled",
  pluginDisabledTitle: "Plugin disabled",
  pluginRemovedTitle: "Plugin removed",
  pluginAlreadyInstalled: "Plugin {id} is already installed",
  pluginIdInvalid:
    "Plugin IDs must start with a lowercase letter and contain only letters, numbers, dots, underscores, or hyphens",
  pluginManifestMissing: "The plugin manifest must provide a name and version",
} as const;

export type MessageKey = keyof typeof enUS;
type Messages = Record<MessageKey, string>;

const zhCN: Messages = {
  metaDescription: "QuickCalc 快速桌面计算器",
  rootMissing: "缺少 #app 根元素",
  elementMissing: "缺少必需元素：{selector}",
  quitTitle: "退出 QuickCalc",
  expressionLabel: "表达式",
  expressionPlaceholder: "输入表达式或 /help，例如 0b1010.oct",
  waiting: "等待输入",
  interactionHint: "Enter 计算 · /help 帮助 · 再按 Enter 复制 · Esc 隐藏",
  recentHistory: "最近记录",
  recentCalculations: "最近计算",
  emptyHistory: "计算结果会自动保存在这里",
  localAutoSave: "本地计算 · 自动保存",
  resultReady: "结果已就绪",
  commandNotExecuted: "命令未执行",
  commandExecuted: "命令已执行",
  runningCommand: "执行命令中…",
  calculating: "计算中…",
  variableSaved: "已保存变量 {name}",
  copied: "已复制到剪贴板",
  copyFailed: "复制失败：{error}",
  startupFailed: "启动失败：{error}",
  commandNameInvalid: "命令名必须以字母开头，并且只能包含字母、数字或连字符",
  commandAlreadyRegistered: "命令 /{name} 已注册",
  commandEmpty: "命令不能为空",
  helpHint: "输入 /help 查看可用命令。",
  unknownCommand: "未知命令：/{name}",
  commandExecutionFailed: "命令 /{name} 执行失败",
  helpSummary: "显示用法、帮助或指定命令的说明",
  helpUsage: "/help [命令]",
  commandNotFound: "没有找到命令：/{name}",
  usageLine: "用法：{usage}",
  helpTitle: "QuickCalc 帮助",
  helpExpression: "表达式：输入表达式后按 Enter 求值；表达式不变时再按 Enter 复制结果。",
  helpBaseConversion:
    "进制转换：使用“源表达式.进制”，例如 0b1010.oct、12345.6789.hex。",
  helpTime:
    "时间：tmstamp 为 Unix 秒时间戳；tmlocal 与 tmutc 显示本地时间和 UTC，可保存后相减。",
  helpAscii: "ASCII：Hello.ascii 转为编码；72 101 108 108 111.tostr 转回字符串。",
  pluginSummary: "列出、启用、停用或移除已加载插件",
  pluginUsage: "/plugin [list|enable <id>|disable <id>|remove <id>|help]",
  pluginHelpTitle: "插件管理帮助",
  pluginListHelp: "/plugin list — 列出已加载插件",
  pluginEnableHelp: "/plugin enable <id> — 启用插件",
  pluginDisableHelp: "/plugin disable <id> — 停用插件",
  pluginRemoveHelp: "/plugin remove <id> — 移除插件",
  pluginHostHelp: "插件宿主可通过 QuickCalcPlugin 接口和 PluginManager.install() 接入可信插件。",
  pluginManagementTitle: "插件管理",
  pluginEnabled: "已启用",
  pluginDisabled: "已停用",
  noPlugins: "当前没有已加载插件。",
  pluginHelpHint: "输入 /plugin help 查看管理命令。",
  unknownPluginAction: "未知插件操作：{action}",
  missingPluginId: "缺少插件 ID",
  pluginActionUsage: "用法：/plugin {action} <id>",
  pluginNotFound: "未找到插件：{id}",
  pluginListHint: "输入 /plugin list 查看已加载插件。",
  pluginEnabledTitle: "已启用插件",
  pluginDisabledTitle: "已停用插件",
  pluginRemovedTitle: "已移除插件",
  pluginAlreadyInstalled: "插件 {id} 已安装",
  pluginIdInvalid: "插件 ID 必须以小写字母开头，并且只能包含字母、数字、点、下划线或连字符",
  pluginManifestMissing: "插件清单必须提供名称和版本",
};

const zhTW: Messages = {
  metaDescription: "QuickCalc 快速桌面計算機",
  rootMissing: "缺少 #app 根元素",
  elementMissing: "缺少必要元素：{selector}",
  quitTitle: "結束 QuickCalc",
  expressionLabel: "運算式",
  expressionPlaceholder: "輸入運算式或 /help，例如 0b1010.oct",
  waiting: "等待輸入",
  interactionHint: "Enter 計算 · /help 說明 · 再按 Enter 複製 · Esc 隱藏",
  recentHistory: "最近記錄",
  recentCalculations: "最近計算",
  emptyHistory: "計算結果會自動儲存在這裡",
  localAutoSave: "本機計算 · 自動儲存",
  resultReady: "結果已就緒",
  commandNotExecuted: "指令未執行",
  commandExecuted: "指令已執行",
  runningCommand: "正在執行指令…",
  calculating: "計算中…",
  variableSaved: "已儲存變數 {name}",
  copied: "已複製到剪貼簿",
  copyFailed: "複製失敗：{error}",
  startupFailed: "啟動失敗：{error}",
  commandNameInvalid: "指令名稱必須以字母開頭，且只能包含字母、數字或連字號",
  commandAlreadyRegistered: "指令 /{name} 已註冊",
  commandEmpty: "指令不能為空",
  helpHint: "輸入 /help 查看可用指令。",
  unknownCommand: "未知指令：/{name}",
  commandExecutionFailed: "指令 /{name} 執行失敗",
  helpSummary: "顯示用法、說明或指定指令的資訊",
  helpUsage: "/help [指令]",
  commandNotFound: "找不到指令：/{name}",
  usageLine: "用法：{usage}",
  helpTitle: "QuickCalc 說明",
  helpExpression: "運算式：輸入運算式後按 Enter 求值；運算式不變時再按 Enter 複製結果。",
  helpBaseConversion:
    "進位轉換：使用「來源運算式.進位」，例如 0b1010.oct、12345.6789.hex。",
  helpTime:
    "時間：tmstamp 是 Unix 秒時間戳；tmlocal 與 tmutc 顯示本機時間和 UTC，可儲存後相減。",
  helpAscii: "ASCII：Hello.ascii 轉為編碼；72 101 108 108 111.tostr 轉回字串。",
  pluginSummary: "列出、啟用、停用或移除已載入的外掛程式",
  pluginUsage: "/plugin [list|enable <id>|disable <id>|remove <id>|help]",
  pluginHelpTitle: "外掛程式管理說明",
  pluginListHelp: "/plugin list — 列出已載入的外掛程式",
  pluginEnableHelp: "/plugin enable <id> — 啟用外掛程式",
  pluginDisableHelp: "/plugin disable <id> — 停用外掛程式",
  pluginRemoveHelp: "/plugin remove <id> — 移除外掛程式",
  pluginHostHelp:
    "外掛程式主機可透過 QuickCalcPlugin 介面和 PluginManager.install() 接入受信任的外掛程式。",
  pluginManagementTitle: "外掛程式管理",
  pluginEnabled: "已啟用",
  pluginDisabled: "已停用",
  noPlugins: "目前沒有已載入的外掛程式。",
  pluginHelpHint: "輸入 /plugin help 查看管理指令。",
  unknownPluginAction: "未知的外掛程式操作：{action}",
  missingPluginId: "缺少外掛程式 ID",
  pluginActionUsage: "用法：/plugin {action} <id>",
  pluginNotFound: "找不到外掛程式：{id}",
  pluginListHint: "輸入 /plugin list 查看已載入的外掛程式。",
  pluginEnabledTitle: "已啟用外掛程式",
  pluginDisabledTitle: "已停用外掛程式",
  pluginRemovedTitle: "已移除外掛程式",
  pluginAlreadyInstalled: "外掛程式 {id} 已安裝",
  pluginIdInvalid: "外掛程式 ID 必須以小寫字母開頭，且只能包含字母、數字、點、底線或連字號",
  pluginManifestMissing: "外掛程式資訊清單必須提供名稱和版本",
};

const catalogs: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en-US": enUS,
};

export interface I18n {
  locale: Locale;
  t(key: MessageKey, parameters?: Record<string, string | number>): string;
}

export function resolveLocale(language?: string | null): Locale {
  const normalized = language?.trim().replaceAll("_", "-").toLowerCase() ?? "";
  if (
    normalized === "zh-tw" ||
    normalized.startsWith("zh-tw-") ||
    normalized === "zh-hk" ||
    normalized.startsWith("zh-hk-") ||
    normalized === "zh-mo" ||
    normalized.startsWith("zh-mo-") ||
    normalized.includes("hant")
  ) {
    return "zh-TW";
  }
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized.startsWith("zh-cn-") ||
    normalized === "zh-sg" ||
    normalized.startsWith("zh-sg-") ||
    normalized.includes("hans")
  ) {
    return "zh-CN";
  }
  return "en-US";
}

export function createI18n(language = detectSystemLanguage()): I18n {
  const locale = resolveLocale(language);
  return {
    locale,
    t: (key, parameters) => interpolate(catalogs[locale][key], parameters),
  };
}

function detectSystemLanguage(): string {
  return typeof navigator === "undefined" ? "en-US" : navigator.language;
}

function interpolate(
  message: string,
  parameters: Record<string, string | number> | undefined,
): string {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => {
    const value = parameters?.[name];
    return value === undefined ? placeholder : String(value);
  });
}
