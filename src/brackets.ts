const OPEN_TO_CLOSE: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));

export interface BracketEdit {
  value: string;
  cursor: number;
}

/** Returns an edit when a bracket key should be handled by QuickCalc. */
export function applyBracketKey(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: string,
): BracketEdit | null {
  const closing = OPEN_TO_CLOSE[key];
  if (closing) {
    const selected = value.slice(selectionStart, selectionEnd);
    return {
      value:
        value.slice(0, selectionStart) +
        key +
        selected +
        closing +
        value.slice(selectionEnd),
      cursor: selectionStart + 1,
    };
  }

  if (
    CLOSERS.has(key) &&
    selectionStart === selectionEnd &&
    value.at(selectionStart) === key
  ) {
    return { value, cursor: selectionStart + 1 };
  }

  return null;
}

/** Appends only the missing trailing closers; malformed early closers are untouched. */
export function completeTrailingBrackets(value: string): string {
  const stack: string[] = [];

  for (const character of value) {
    const closing = OPEN_TO_CLOSE[character];
    if (closing) {
      stack.push(closing);
      continue;
    }

    if (CLOSERS.has(character)) {
      if (stack.at(-1) !== character) {
        return value;
      }
      stack.pop();
    }
  }

  return value + stack.reverse().join("");
}

