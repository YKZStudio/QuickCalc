import assert from "node:assert/strict";
import test from "node:test";

import { createCommandRuntime } from "./commands.ts";
import { createI18n } from "./i18n.ts";

test("ignores calculator expressions and handles built-in help", async () => {
  const runtime = createCommandRuntime(createI18n("zh-CN"));

  assert.equal(await runtime.execute("2 + 2"), null);
  const help = await runtime.execute("/help");
  assert.equal(help?.title, "QuickCalc 帮助");
  assert.ok(help?.lines.some((line) => line.includes("0b1010.oct")));
  assert.ok(help?.lines.some((line) => line.includes("tmlocal")));
  assert.ok(help?.lines.some((line) => line.includes("Hello.ascii")));
  assert.ok(help?.lines.some((line) => line.includes("base64")));
  assert.ok(help?.lines.some((line) => line.includes("/del")));
  assert.ok(help?.lines.some((line) => line.includes("/plugin")));
});

test("returns useful errors for empty and unknown commands", async () => {
  const runtime = createCommandRuntime(createI18n("zh-CN"));

  assert.equal((await runtime.execute("/"))?.tone, "error");
  assert.equal((await runtime.execute("/missing"))?.title, "未知命令：/missing");
});

test("plugin manager registers and removes plugin commands", async () => {
  const runtime = createCommandRuntime(createI18n("zh-CN"));
  runtime.plugins.install(
    {
      manifest: { id: "demo", name: "Demo", version: "1.0.0" },
      activate: ({ registerCommand }) =>
        registerCommand({
          name: "hello",
          summary: "测试插件命令",
          usage: "/hello",
          execute: () => ({ title: "Hello", lines: ["plugin"] }),
        }),
    },
    false,
  );

  assert.equal((await runtime.execute("/plugin list"))?.lines[0], "demo 1.0.0 · 已停用 · Demo");
  assert.equal((await runtime.execute("/hello"))?.tone, "error");
  assert.equal((await runtime.execute("/plugin enable demo"))?.tone, "success");
  assert.equal((await runtime.execute("/hello"))?.title, "Hello");
  assert.equal((await runtime.execute("/plugin disable demo"))?.tone, "success");
  assert.equal((await runtime.execute("/hello"))?.tone, "error");
  assert.equal((await runtime.execute("/plugin remove demo"))?.tone, "success");
  assert.deepEqual(runtime.plugins.list(), []);
});

test("localizes built-in commands and falls back to American English", async () => {
  const traditional = createCommandRuntime(createI18n("zh-TW"));
  assert.equal((await traditional.execute("/help"))?.title, "QuickCalc 說明");
  assert.equal((await traditional.execute("/missing"))?.title, "未知指令：/missing");

  const english = createCommandRuntime(createI18n("fr-FR"));
  assert.equal((await english.execute("/help"))?.title, "QuickCalc Help");
  assert.equal((await english.execute("/plugin list"))?.lines[0], "No plugins are currently loaded.");
});

test("cleans history and persists color modes through application actions", async () => {
  let colorMode: "auto" | "light" | "dark" = "auto";
  let cleanCalls = 0;
  const runtime = createCommandRuntime(createI18n("zh-CN"), {
    cleanHistory: async () => {
      cleanCalls += 1;
      return 7;
    },
    deleteVariable: async () => false,
    getColorMode: () => colorMode,
    setColorMode: async (mode) => {
      colorMode = mode;
    },
    hideWindow: async () => undefined,
    shutdown: async () => undefined,
  });

  assert.equal((await runtime.execute("/clean"))?.lines[0], "已清空 7 条历史记录。");
  assert.equal(cleanCalls, 1);
  assert.equal((await runtime.execute("/clean now"))?.tone, "error");
  assert.equal((await runtime.execute("/color"))?.lines[0], "当前颜色模式：自动。");
  assert.equal((await runtime.execute("/color dark"))?.tone, "success");
  assert.equal(colorMode, "dark");
  assert.equal((await runtime.execute("/color"))?.lines[0], "当前颜色模式：暗色。");
  assert.equal((await runtime.execute("/color blue"))?.tone, "error");
});

test("deletes user variables while protecting built-ins", async () => {
  const variables = new Set(["tax"]);
  const deleted: string[] = [];
  const runtime = createCommandRuntime(createI18n("zh-CN"), {
    cleanHistory: async () => 0,
    deleteVariable: async (name) => {
      deleted.push(name);
      return variables.delete(name);
    },
    getColorMode: () => "auto",
    setColorMode: async () => undefined,
    hideWindow: async () => undefined,
    shutdown: async () => undefined,
  });

  assert.equal((await runtime.execute("/del"))?.tone, "error");
  assert.equal((await runtime.execute("/del tax extra"))?.tone, "error");
  assert.equal((await runtime.execute("/del pi"))?.title, "内置变量或常量 pi 不可删除");
  assert.deepEqual(deleted, []);
  assert.equal((await runtime.execute("/del missing"))?.title, "没有找到变量：missing");
  assert.equal((await runtime.execute("/del TAX"))?.tone, "success");
  assert.deepEqual(deleted, ["missing", "tax"]);
  assert.equal(variables.has("tax"), false);
});

test("hides or shuts down the application through lifecycle commands", async () => {
  let hideCalls = 0;
  let shutdownCalls = 0;
  const runtime = createCommandRuntime(createI18n("zh-CN"), {
    cleanHistory: async () => 0,
    deleteVariable: async () => false,
    getColorMode: () => "auto",
    setColorMode: async () => undefined,
    hideWindow: async () => { hideCalls += 1; },
    shutdown: async () => { shutdownCalls += 1; },
  });

  assert.equal((await runtime.execute("/exit"))?.tone, "success");
  assert.equal((await runtime.execute("/quit"))?.tone, "success");
  assert.equal(hideCalls, 2);
  assert.equal((await runtime.execute("/shutdown"))?.tone, "success");
  assert.equal(shutdownCalls, 1);
  assert.equal((await runtime.execute("/exit later"))?.tone, "error");
  assert.equal((await runtime.execute("/shutdown now"))?.tone, "error");
});
