import assert from "node:assert/strict";
import test from "node:test";

import { createI18n, resolveLocale } from "./i18n.ts";

test("maps Simplified and Traditional Chinese system locales", () => {
  for (const language of ["zh", "zh-CN", "zh_SG", "zh-Hans-CN"]) {
    assert.equal(resolveLocale(language), "zh-CN");
  }
  for (const language of ["zh-TW", "zh_HK", "zh-MO", "zh-Hant-TW"]) {
    assert.equal(resolveLocale(language), "zh-TW");
  }
});

test("falls back to American English for every other system locale", () => {
  for (const language of ["en-US", "en-GB", "fr-FR", "ja-JP", ""]) {
    assert.equal(resolveLocale(language), "en-US");
  }
});

test("translates messages and interpolates values", () => {
  assert.equal(createI18n("zh-CN").t("waiting"), "等待输入");
  assert.equal(createI18n("zh-TW").t("waiting"), "等待輸入");
  assert.equal(createI18n("de-DE").t("waiting"), "Waiting for input");
  assert.equal(
    createI18n("en-US").t("variableSaved", { name: "start" }),
    "Saved variable start",
  );
});
