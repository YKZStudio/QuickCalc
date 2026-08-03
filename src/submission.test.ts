import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubmission } from "./submission.ts";

test("copies the previous result when Enter is pressed on a cleared input", () => {
  assert.deepEqual(resolveSubmission("", true), { kind: "copy" });
  assert.deepEqual(resolveSubmission("   ", true), { kind: "copy" });
  assert.deepEqual(resolveSubmission("", false), { kind: "none" });
});

test("captures commands and expressions before the interface clears the input", () => {
  assert.deepEqual(resolveSubmission(" /color dark ", true), {
    kind: "command",
    value: "/color dark",
  });
  assert.deepEqual(resolveSubmission(" 1 + 2 ", true), {
    kind: "expression",
    value: "1 + 2",
  });
});
