export interface HistoryNavigationState {
  draft: string;
  historyIndex: number | null;
}

export interface HistoryNavigationResult {
  state: HistoryNavigationState;
  value: string;
}

export function createHistoryNavigationState(): HistoryNavigationState {
  return { draft: "", historyIndex: null };
}

/** Navigates a newest-first expression list while preserving the current, unsubmitted draft. */
export function navigateHistory(
  currentValue: string,
  expressions: readonly string[],
  direction: "older" | "newer",
  state: HistoryNavigationState,
): HistoryNavigationResult | null {
  if (direction === "older") {
    if (expressions.length === 0) {
      return null;
    }
    const historyIndex =
      state.historyIndex === null
        ? 0
        : Math.min(state.historyIndex + 1, expressions.length - 1);
    return {
      state: {
        draft: state.historyIndex === null ? currentValue : state.draft,
        historyIndex,
      },
      value: expressions[historyIndex] ?? currentValue,
    };
  }

  if (state.historyIndex === null) {
    return null;
  }
  if (state.historyIndex === 0) {
    return {
      state: createHistoryNavigationState(),
      value: state.draft,
    };
  }

  const historyIndex = state.historyIndex - 1;
  return {
    state: { ...state, historyIndex },
    value: expressions[historyIndex] ?? state.draft,
  };
}
