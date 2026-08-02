import type { CommandDefinition, CommandRegistry } from "./commands.ts";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface PluginContext {
  registerCommand(command: CommandDefinition): () => void;
}

export interface QuickCalcPlugin {
  manifest: PluginManifest;
  activate(context: PluginContext): void | (() => void);
}

export interface PluginSnapshot extends PluginManifest {
  enabled: boolean;
}

interface InstalledPlugin {
  plugin: QuickCalcPlugin;
  enabled: boolean;
  deactivate: (() => void) | null;
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9._-]*$/;

export class PluginManager {
  readonly #commands: CommandRegistry;
  readonly #plugins = new Map<string, InstalledPlugin>();

  constructor(commands: CommandRegistry) {
    this.#commands = commands;
  }

  install(plugin: QuickCalcPlugin, enabled = true): PluginSnapshot {
    const id = normalizePluginId(plugin.manifest.id);
    validateManifest({ ...plugin.manifest, id });
    if (this.#plugins.has(id)) {
      throw new Error(`插件 ${id} 已安装`);
    }

    const installed: InstalledPlugin = {
      plugin: { ...plugin, manifest: { ...plugin.manifest, id } },
      enabled: false,
      deactivate: null,
    };
    this.#plugins.set(id, installed);

    try {
      if (enabled) {
        this.enable(id);
      }
    } catch (error) {
      this.#plugins.delete(id);
      throw error;
    }
    return this.get(id) as PluginSnapshot;
  }

  enable(id: string): PluginSnapshot {
    const installed = this.requirePlugin(id);
    if (installed.enabled) {
      return snapshot(installed);
    }

    const commandDisposers: Array<() => void> = [];
    const context: PluginContext = {
      registerCommand: (command) => {
        const dispose = this.#commands.register(command);
        commandDisposers.push(dispose);
        return dispose;
      },
    };

    try {
      const pluginCleanup = installed.plugin.activate(context);
      installed.deactivate = () => {
        try {
          if (typeof pluginCleanup === "function") {
            pluginCleanup();
          }
        } finally {
          for (const dispose of commandDisposers.reverse()) {
            dispose();
          }
        }
      };
      installed.enabled = true;
      return snapshot(installed);
    } catch (error) {
      for (const dispose of commandDisposers.reverse()) {
        dispose();
      }
      throw error;
    }
  }

  disable(id: string): PluginSnapshot {
    const installed = this.requirePlugin(id);
    if (!installed.enabled) {
      return snapshot(installed);
    }

    const deactivate = installed.deactivate;
    installed.deactivate = null;
    installed.enabled = false;
    deactivate?.();
    return snapshot(installed);
  }

  uninstall(id: string): PluginSnapshot {
    const installed = this.requirePlugin(id);
    const removed = snapshot(installed);
    this.disable(id);
    this.#plugins.delete(normalizePluginId(id));
    return removed;
  }

  get(id: string): PluginSnapshot | null {
    const installed = this.#plugins.get(normalizePluginId(id));
    return installed ? snapshot(installed) : null;
  }

  list(): PluginSnapshot[] {
    return [...this.#plugins.values()]
      .map(snapshot)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private requirePlugin(id: string): InstalledPlugin {
    const normalized = normalizePluginId(id);
    const installed = this.#plugins.get(normalized);
    if (!installed) {
      throw new Error(`未找到插件：${normalized || id}`);
    }
    return installed;
  }
}

function normalizePluginId(id: string): string {
  return id.trim().toLowerCase();
}

function validateManifest(manifest: PluginManifest): void {
  if (!PLUGIN_ID_PATTERN.test(manifest.id)) {
    throw new Error("插件 ID 必须以小写字母开头，并且只能包含字母、数字、点、下划线或连字符");
  }
  if (!manifest.name.trim() || !manifest.version.trim()) {
    throw new Error("插件清单必须提供名称和版本");
  }
}

function snapshot(installed: InstalledPlugin): PluginSnapshot {
  return {
    ...installed.plugin.manifest,
    enabled: installed.enabled,
  };
}
