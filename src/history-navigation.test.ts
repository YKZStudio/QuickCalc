import assert from "node:assert/strict";
import test from "node:test";

import {
  createHistoryNavigationState,
  navigateHistory,
} from "./history-navigation.ts";

test("moves through newest-first history and returns to the unsubmitted draft", () => {
  const history = ["3 + 3", "2 + 2", "1 + 1"];
  let state = createHistoryNavigationState();

  const newest = navigateHistory("unfinished +", history, "older", state);
  assert.deepEqual(newest?.value, "3 + 3");
  state = newest!.state;

  const older = navigateHistory(newest!.value, history, "older", state);
  assert.deepEqual(older?.value, "2 + 2");
  state = older!.state;

  const newer = navigateHistory(older!.value, history, "newer", state);
  assert.deepEqual(newer?.value, "3 + 3");
  state = newer!.state;

  const draft = navigateHistory(newer!.value, history, "newer", state);
  assert.deepEqual(draft, {
    state: createHistoryNavigationState(),
    value: "unfinished +",
  });
});

test("stops at the oldest entry and ignores newer navigation from the draft", () => {
  const history = ["latest", "oldest"];
  let state = createHistoryNavigationState();

  state = navigateHistory("draft", history, "older", state)!.state;
  const oldest = navigateHistory("latest", history, "older", state)!;
  const stillOldest = navigateHistory(oldest.value, history, "older", oldest.state)!;

  assert.equal(stillOldest.value, "oldest");
  assert.equal(navigateHistory("draft", history, "newer", createHistoryNavigationState()), null);
  assert.equal(navigateHistory("draft", [], "older", createHistoryNavigationState()), null);
});
