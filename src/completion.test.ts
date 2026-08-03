import assert from "node:assert/strict";
import test from "node:test";

import { applyCompletion, DATA_OPERATIONS, getCompletionSuggestions } from "./completion.ts";

const variables = ["pi", "e", "res", "tmstamp", "tmlocal", "tmutc", "tax"];
const commands = ["help", "plugin"];

test("completes slash commands", () => {
  const suggestions = getCompletionSuggestions("/he", 3, variables, [
    { name: "help", description: "Show help" },
    "plugin",
  ]);
  assert.deepEqual(suggestions.map(({ label }) => label), ["/help"]);
  assert.equal(suggestions[0]?.description, "Show help");
  assert.deepEqual(applyCompletion("/he", suggestions[0]!), {
    value: "/help",
    cursor: 5,
  });
});

test("keeps descriptions attached to matching variable candidates", () => {
  const suggestions = getCompletionSuggestions(
    "p",
    1,
    [{ name: "pi", description: "圆周率" }],
    commands,
  );
  assert.equal(suggestions[0]?.label, "pi");
  assert.equal(suggestions[0]?.description, "圆周率");
});

test("completes variables at the caret without replacing the expression", () => {
  const suggestions = getCompletionSuggestions("1 + tml", 7, variables, commands);
  assert.deepEqual(suggestions.map(({ label }) => label), ["tmlocal"]);
  assert.deepEqual(applyCompletion("1 + tml", suggestions[0]!), {
    value: "1 + tmlocal",
    cursor: 11,
  });
});

test("does not suggest an already complete name", () => {
  assert.deepEqual(getCompletionSuggestions("pi", 2, variables, commands), []);
});

test("completes data operations after a dot", () => {
  const input = "255.he";
  const suggestions = getCompletionSuggestions(
    input,
    input.length,
    variables,
    commands,
    DATA_OPERATIONS,
  );
  assert.deepEqual(suggestions.map(({ label }) => label), [".hex"]);
  assert.deepEqual(applyCompletion(input, suggestions[0]!), {
    value: "255.hex",
    cursor: 7,
  });
});

test("offers every operation after a trailing dot", () => {
  const suggestions = getCompletionSuggestions("data.", 5, variables, commands);
  assert.deepEqual(
    suggestions.map(({ label }) => label),
    DATA_OPERATIONS.map((operation) => `.${operation}`),
  );
});

test("completes tostr after base64 data containing padding", () => {
  const input = "SGVsbG8=.to";
  const suggestions = getCompletionSuggestions(input, input.length, variables, commands);
  assert.deepEqual(suggestions.map(({ label }) => label), [".tostr"]);
  assert.equal(applyCompletion(input, suggestions[0]!).value, "SGVsbG8=.tostr");
});
