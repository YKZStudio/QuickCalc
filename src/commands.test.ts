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
