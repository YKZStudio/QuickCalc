import { PluginManager } from "./plugins.ts";

export type CommandTone = "info" | "success" | "error";

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
  readonly #commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition): () => void {
    const names = [command.name, ...(command.aliases ?? [])].map(normalizeCommandName);
    if (names.some((name) => !COMMAND_NAME_PATTERN.test(name))) {
      throw new Error("命令名必须以字母开头，并且只能包含字母、数字或连字符");
    }
    for (const name of names) {
      if (this.#commands.has(name)) {
        throw new Error(`命令 /${name} 已注册`);
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
      return errorResult("命令不能为空", ["输入 /help 查看可用命令。"]);
    }

    const command = this.get(invocation.name);
    if (!command) {
      return errorResult(`未知命令：/${invocation.name}`, ["输入 /help 查看可用命令。"]);
    }

    try {
      return await command.execute(invocation);
    } catch (error) {
      return errorResult(`命令 /${command.name} 执行失败`, [String(error)]);
    }
  }
}

export function createCommandRuntime(): CommandRuntime {
  const commands = new CommandRegistry();
  const plugins = new PluginManager(commands);

  commands.register({
    name: "help",
    aliases: ["h"],
    summary: "显示用法、帮助或指定命令的说明",
    usage: "/help [命令]",
    execute: ({ args }) => {
      const requested = args[0]?.replace(/^\//, "");
      if (requested) {
        const command = commands.get(requested);
        if (!command) {
          return errorResult(`没有找到命令：/${requested}`, ["输入 /help 查看可用命令。"]);
        }
        return {
          title: `/${command.name}`,
          lines: [command.summary, `用法：${command.usage}`],
        };
      }

      return {
        title: "QuickCalc 帮助",
        lines: [
          "表达式：输入表达式后按 Enter 求值；表达式不变时再按 Enter 复制结果。",
          "进制转换：使用“源表达式.进制”，例如 0b1010.oct、12345.6789.hex。",
          ...commands.list().map((command) => `${command.usage} — ${command.summary}`),
        ],
      };
    },
  });

  commands.register({
    name: "plugin",
    aliases: ["plugins"],
    summary: "列出、启用、停用或移除已加载插件",
    usage: "/plugin [list|enable <id>|disable <id>|remove <id>|help]",
    execute: ({ args }) => executePluginCommand(plugins, args),
  });

  return {
    commands,
    plugins,
    execute: (input) => commands.execute(input),
  };
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

function executePluginCommand(plugins: PluginManager, args: string[]): CommandResult {
  const action = (args[0] ?? "list").toLowerCase();
  if (action === "help") {
    return {
      title: "插件管理帮助",
      lines: [
        "/plugin list — 列出已加载插件",
        "/plugin enable <id> — 启用插件",
        "/plugin disable <id> — 停用插件",
        "/plugin remove <id> — 移除插件",
        "插件宿主可通过 QuickCalcPlugin 接口和 PluginManager.install() 接入可信插件。",
      ],
    };
  }

  if (action === "list") {
    const installed = plugins.list();
    return {
      title: "插件管理",
      lines: installed.length
        ? installed.map(
            (plugin) =>
              `${plugin.id} ${plugin.version} · ${plugin.enabled ? "已启用" : "已停用"} · ${plugin.name}`,
          )
        : ["当前没有已加载插件。", "输入 /plugin help 查看管理命令。"],
    };
  }

  if (!["enable", "disable", "remove"].includes(action)) {
    return errorResult(`未知插件操作：${action}`, ["输入 /plugin help 查看管理命令。"]);
  }

  const id = args[1];
  if (!id) {
    return errorResult("缺少插件 ID", [`用法：/plugin ${action} <id>`]);
  }
  if (!plugins.get(id)) {
    return errorResult(`未找到插件：${id}`, ["输入 /plugin list 查看已加载插件。"]);
  }

  const plugin =
    action === "enable"
      ? plugins.enable(id)
      : action === "disable"
        ? plugins.disable(id)
        : plugins.uninstall(id);
  const verb = action === "enable" ? "已启用" : action === "disable" ? "已停用" : "已移除";
  return {
    title: `${verb}插件`,
    lines: [`${plugin.id} ${plugin.version} · ${plugin.name}`],
    tone: "success",
  };
}

function errorResult(title: string, lines: string[]): CommandResult {
  return { title, lines, tone: "error" };
}
