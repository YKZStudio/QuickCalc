import assert from "node:assert/strict";
import test from "node:test";

import { applyBracketKey } from "./brackets.ts";
import { normalizeExpressionInput } from "./input-normalization.ts";

test("normalizes full-width digits, letters, brackets, and operators", () => {
  assert.equal(normalizeExpressionInput("ｍａｘ（１，２）＋３×４"), "max(1,2)+3*4");
  assert.equal(normalizeExpressionInput("５＾３"), "5^3");
});

test("normalizes common Chinese bracket and punctuation variants", () => {
  assert.equal(normalizeExpressionInput("【２。５＋〔３、４〕】"), "[2.5+[3,4]]");
});

test("normalizes pasted minus, division, assignment, and conversion symbols", () => {
  assert.equal(normalizeExpressionInput("ｘ＝２５５－＞ｈｅｘ"), "x=255->hex");
  assert.equal(normalizeExpressionInput("８÷２—１"), "8/2-1");
});

test("leaves supported ASCII and mathematical constants unchanged", () => {
  assert.equal(normalizeExpressionInput("sqrt(81) + π"), "sqrt(81) + π");
});

test("lets a Chinese opening bracket participate in automatic pairing", () => {
  assert.deepEqual(applyBracketKey("", 0, 0, normalizeExpressionInput("（")), {
    value: "()",
    cursor: 1,
  });
});
