import assert from "node:assert/strict";
import test from "node:test";

import { applyBracketKey, completeTrailingBrackets } from "./brackets.ts";

test("inserts a matching pair and keeps the cursor inside", () => {
  assert.deepEqual(applyBracketKey("1 + ", 4, 4, "("), {
    value: "1 + ()",
    cursor: 5,
  });
});

test("wraps selected text", () => {
  assert.deepEqual(applyBracketKey("2 + 3", 0, 5, "["), {
    value: "[2 + 3]",
    cursor: 1,
  });
});

test("moves over an existing closing bracket", () => {
  assert.deepEqual(applyBracketKey("sqrt()", 5, 5, ")"), {
    value: "sqrt()",
    cursor: 6,
  });
});

test("completes nested trailing brackets", () => {
  assert.equal(completeTrailingBrackets("max(1, [2 + 3"), "max(1, [2 + 3])");
});

test("does not rewrite malformed brackets", () => {
  assert.equal(completeTrailingBrackets("([)]"), "([)]");
});

