import { PluginManager } from "./plugins.ts";
import { createI18n, type I18n } from "./i18n.ts";

export type CommandTone = "info" | "success" | "error";
export type ColorMode = "auto" | "light" | "dark";

export interface AppCommandActions {
  cleanHistory(): Promise<number>;
  deleteVariable(name: string): Promise<boolean>;
  getColorMode(): ColorMode;
  setColorMode(mode: ColorMode): Promise<void>;
  hideWindow(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface CommandResult {
  title: string;
  lines: string[];
  tone?: CommandTone;
}

export interface CommandInvocation {
  name: string;
  args: string[];
  raw: string;
}

export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string;
  aliases?: string[];
  execute(invocation: CommandInvocation): CommandResult | Promise<CommandResult>;
}

export interface CommandRuntime {
  commands: CommandRegistry;
  plugins: PluginManager;
  execute(input: string): Promise<CommandResult | null>;
}

const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export class CommandRegistry {
  readonly #i18n: I18n;
  readonly #commands = new Map<string, CommandDefinition>();

  constructor(i18n = createI18n()) {
    this.#i18n = i18n;
  }

  register(command: CommandDefinition): () => void {
    const names = [command.name, ...(command.aliases ?? [])].map(normalizeCommandName);
    if (names.some((name) => !COMMAND_NAME_PATTERN.test(name))) {
      throw new Error(this.#i18n.t("commandNameInvalid"));
    }
    for (const name of names) {
      if (this.#commands.has(name)) {
        throw new Error(this.#i18n.t("commandAlreadyRegistered", { name }));
      }
    }
    for (const name of names) {
      this.#commands.set(name, command);
    }

    return () => {
      for (const name of names) {
        if (this.#commands.get(name) === command) {
          this.#commands.delete(name);
        }
      }
    };
  }

  get(name: string): CommandDefinition | null {
    return this.#commands.get(normalizeCommandName(name)) ?? null;
  }

  list(): CommandDefinition[] {
    const unique = new Map<string, CommandDefinition>();
    for (const command of this.#commands.values()) {
      unique.set(normalizeCommandName(command.name), command);
    }
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async execute(input: string): Promise<CommandResult | null> {
    const invocation = parseCommand(input);
    if (!invocation) {
      return null;
    }
    if (!invocation.name) {
      return errorResult(this.#i18n.t("commandEmpty"), [this.#i18n.t("helpHint")]);
    }

    const command = this.get(invocation.name);
    if (!command) {
      return errorResult(this.#i18n.t("unknownCommand", { name: invocation.name }), [
        this.#i18n.t("helpHint"),
      ]);
    }

    try {
      return await command.execute(invocation);
    } catch (error) {
      return errorResult(this.#i18n.t("commandExecutionFailed", { name: command.name }), [
        String(error),
      ]);
    }
  }
}

export function createCommandRuntime(
  i18n = createI18n(),
  actions: AppCommandActions = {
    cleanHistory: async () => 0,
    deleteVariable: async () => false,
    getColorMode: () => "auto",
    setColorMode: async () => undefined,
    hideWindow: async () => undefined,
    shutdown: async () => undefined,
  },
): CommandRuntime {
  const commands = new CommandRegistry(i18n);
  const plugins = new PluginManager(commands, i18n);

  commands.register({
    name: "help",
    aliases: ["h"],
    summary: i18n.t("helpSummary"),
    usage: i18n.t("helpUsage"),
    execute: ({ args }) => {
      const requested = args[0]?.replace(/^\//, "");
      if (requested) {
        const command = commands.get(requested);
        if (!command) {
          return errorResult(i18n.t("commandNotFound", { name: requested }), [
            i18n.t("helpHint"),
          ]);
        }
        return {
          title: `/${command.name}`,
          lines: [command.summary, i18n.t("usageLine", { usage: command.usage })],
        };
      }

      return {
        title: i18n.t("helpTitle"),
        lines: [
          i18n.t("helpExpression"),
          i18n.t("helpBaseConversion"),
          i18n.t("helpTime"),
          i18n.t("helpAscii"),
          ...commands.list().map((command) => `${command.usage} — ${command.summary}`),
        ],
      };
    },
  });

  commands.register({
    name: "plugin",
    aliases: ["plugins"],
    summary: i18n.t("pluginSummary"),
    usage: i18n.t("pluginUsage"),
    execute: ({ args }) => executePluginCommand(plugins, args, i18n),
  });

  commands.register({
    name: "clean",
    summary: i18n.t("cleanSummary"),
    usage: i18n.t("cleanUsage"),
    execute: async ({ args }) => {
      if (args.length > 0) {
        return errorResult(i18n.t("cleanArgumentsInvalid"), [
          i18n.t("usageLine", { usage: i18n.t("cleanUsage") }),
        ]);
      }
      const removed = await actions.cleanHistory();
      return {
        title: i18n.t("cleanTitle"),
        lines: [i18n.t("cleanRemoved", { count: removed })],
        tone: "success",
      };
    },
  });

  commands.register({
    name: "exit",
    aliases: ["quit"],
    summary: i18n.t("exitSummary"),
    usage: i18n.t("exitUsage"),
    execute: async ({ args }) => {
      if (args.length > 0) {
        return errorResult(i18n.t("exitTitle"), [i18n.t("usageLine", { usage: i18n.t("exitUsage") })]);
      }
      await actions.hideWindow();
      return { title: i18n.t("exitTitle"), lines: [i18n.t("exitDone")], tone: "success" };
    },
  });

  commands.register({
    name: "shutdown",
    summary: i18n.t("shutdownSummary"),
    usage: i18n.t("shutdownUsage"),
    execute: async ({ args }) => {
      if (args.length > 0) {
        return errorResult(i18n.t("shutdownSummary"), [i18n.t("usageLine", { usage: i18n.t("shutdownUsage") })]);
      }
      await actions.shutdown();
      return { title: i18n.t("shutdownSummary"), lines: [], tone: "success" };
    },
  });

  commands.register({
    name: "del",
    summary: i18n.t("deleteSummary"),
    usage: i18n.t("deleteUsage"),
    execute: async ({ args }) => {
      if (args.length !== 1) {
        return errorResult(i18n.t("deleteArgumentsInvalid"), [
          i18n.t("usageLine", { usage: i18n.t("deleteUsage") }),
        ]);
      }
      const name = args[0]?.toLowerCase() ?? "";
      if (isBuiltinVariable(name)) {
        return errorResult(i18n.t("deleteBuiltinDenied", { name }), []);
      }
      if (!(await actions.deleteVariable(name))) {
        return errorResult(i18n.t("deleteNotFound", { name }), []);
      }
      return {
        title: i18n.t("deleteTitle"),
        lines: [i18n.t("deleteRemoved", { name })],
        tone: "success",
      };
    },
  });

  commands.register({
    name: "color",
    summary: i18n.t("colorSummary"),
    usage: i18n.t("colorUsage"),
    execute: async ({ args }) => {
      if (args.length === 0) {
        const current = actions.getColorMode();
        return {
          title: i18n.t("colorTitle"),
          lines: [i18n.t("colorCurrent", { mode: colorModeLabel(current, i18n) })],
        };
      }
      const requested = args[0]?.toLowerCase();
      if (args.length !== 1 || !isColorMode(requested)) {
        return errorResult(i18n.t("colorInvalid"), [
          i18n.t("usageLine", { usage: i18n.t("colorUsage") }),
        ]);
      }
      await actions.setColorMode(requested);
      return {
        title: i18n.t("colorTitle"),
        lines: [i18n.t("colorChanged", { mode: colorModeLabel(requested, i18n) })],
        tone: "success",
      };
    },
  });

  return {
    commands,
    plugins,
    execute: (input) => commands.execute(input),
  };
}

function isColorMode(value: string | undefined): value is ColorMode {
  return value === "auto" || value === "light" || value === "dark";
}

function isBuiltinVariable(name: string): boolean {
  return ["pi", "e", "res", "tmstamp", "tmlocal", "tmutc"].includes(name);
}

function colorModeLabel(mode: ColorMode, i18n: I18n): string {
  return i18n.t(
    mode === "auto" ? "colorModeAuto" : mode === "light" ? "colorModeLight" : "colorModeDark",
  );
}

function parseCommand(input: string): CommandInvocation | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const raw = trimmed.slice(1).trim();
  if (!raw) {
    return { name: "", args: [], raw };
  }
  const [name, ...args] = raw.split(/\s+/);
  return {
    name: normalizeCommandName(name ?? ""),
    args,
    raw,
  };
}

function normalizeCommandName(name: string): string {
  return name.trim().replace(/^\//, "").toLowerCase();
}

function executePluginCommand(plugins: PluginManager, args: string[], i18n: I18n): CommandResult {
  const action = (args[0] ?? "list").toLowerCase();
  if (action === "help") {
    return {
      title: i18n.t("pluginHelpTitle"),
      lines: [
        i18n.t("pluginListHelp"),
        i18n.t("pluginEnableHelp"),
        i18n.t("pluginDisableHelp"),
        i18n.t("pluginRemoveHelp"),
        i18n.t("pluginHostHelp"),
      ],
    };
  }

  if (action === "list") {
    const installed = plugins.list();
    return {
      title: i18n.t("pluginManagementTitle"),
      lines: installed.length
        ? installed.map(
            (plugin) =>
              `${plugin.id} ${plugin.version} · ${i18n.t(plugin.enabled ? "pluginEnabled" : "pluginDisabled")} · ${plugin.name}`,
          )
        : [i18n.t("noPlugins"), i18n.t("pluginHelpHint")],
    };
  }

  if (!["enable", "disable", "remove"].includes(action)) {
    return errorResult(i18n.t("unknownPluginAction", { action }), [i18n.t("pluginHelpHint")]);
  }

  const id = args[1];
  if (!id) {
    return errorResult(i18n.t("missingPluginId"), [i18n.t("pluginActionUsage", { action })]);
  }
  if (!plugins.get(id)) {
    return errorResult(i18n.t("pluginNotFound", { id }), [i18n.t("pluginListHint")]);
  }

  const plugin =
    action === "enable"
      ? plugins.enable(id)
      : action === "disable"
        ? plugins.disable(id)
        : plugins.uninstall(id);
  const titleKey =
    action === "enable"
      ? "pluginEnabledTitle"
      : action === "disable"
        ? "pluginDisabledTitle"
        : "pluginRemovedTitle";
  return {
    title: i18n.t(titleKey),
    lines: [`${plugin.id} ${plugin.version} · ${plugin.name}`],
    tone: "success",
  };
}

function errorResult(title: string, lines: string[]): CommandResult {
  return { title, lines, tone: "error" };
}
