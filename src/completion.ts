export const DATA_OPERATIONS = [
  "ascii",
  "base64",
  "bin",
  "dec",
  "dex",
  "hex",
  "oct",
  "tostr",
] as const;

export type CompletionKind = "variable" | "command" | "operation";

export interface CompletionSuggestion {
  label: string;
  kind: CompletionKind;
  start: number;
  end: number;
  replacement: string;
}

export function getCompletionSuggestions(
  value: string,
  cursor: number,
  variableNames: Iterable<string>,
  commandNames: Iterable<string>,
  operationNames: Iterable<string> = DATA_OPERATIONS,
  limit = 8,
): CompletionSuggestion[] {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const commandPrefix = value.slice(0, safeCursor).match(/^\/([a-z0-9-]*)$/i)?.[1];
  const commandSuffix = value.slice(safeCursor);

  if (commandPrefix !== undefined && /^[a-z0-9-]*$/i.test(commandSuffix)) {
    return matchingNames(commandNames, commandPrefix, limit).map((name) => ({
      label: `/${name}`,
      kind: "command",
      start: 0,
      end: value.length,
      replacement: `/${name}`,
    }));
  }

  const beforeCursor = value.slice(0, safeCursor);
  const operationMatch = beforeCursor.match(/\.([a-z0-9]*)$/i);
  if (operationMatch) {
    const operationPrefix = operationMatch[1] ?? "";
    const dotIndex = safeCursor - operationPrefix.length - 1;
    const operationSuffix = value.slice(safeCursor).match(/^[a-z0-9]*/i)?.[0] ?? "";
    if (value.slice(0, dotIndex).trim()) {
      return matchingNames(operationNames, operationPrefix, limit).map((name) => ({
        label: `.${name}`,
        kind: "operation",
        start: dotIndex + 1,
        end: safeCursor + operationSuffix.length,
        replacement: name,
      }));
    }
  }

  const identifierPrefix = beforeCursor.match(/[a-z_][a-z0-9_]*$/i)?.[0];
  if (!identifierPrefix) {
    return [];
  }

  const identifierSuffix = value.slice(safeCursor).match(/^[a-z0-9_]*/i)?.[0] ?? "";
  const start = safeCursor - identifierPrefix.length;
  const end = safeCursor + identifierSuffix.length;
  return matchingNames(variableNames, identifierPrefix, limit).map((name) => ({
    label: name,
    kind: "variable",
    start,
    end,
    replacement: name,
  }));
}

export function applyCompletion(
  value: string,
  suggestion: CompletionSuggestion,
): { value: string; cursor: number } {
  const completed =
    value.slice(0, suggestion.start) + suggestion.replacement + value.slice(suggestion.end);
  return {
    value: completed,
    cursor: suggestion.start + suggestion.replacement.length,
  };
}

function matchingNames(names: Iterable<string>, prefix: string, limit: number): string[] {
  const normalizedPrefix = prefix.toLowerCase();
  return [...new Set([...names].map((name) => name.toLowerCase()))]
    .filter((name) => name.startsWith(normalizedPrefix) && name !== normalizedPrefix)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}
