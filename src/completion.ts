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

export interface CompletionCandidate {
  name: string;
  description?: string;
}

export interface CompletionSuggestion {
  label: string;
  description?: string;
  kind: CompletionKind;
  start: number;
  end: number;
  replacement: string;
}

export function getCompletionSuggestions(
  value: string,
  cursor: number,
  variableNames: Iterable<string | CompletionCandidate>,
  commandNames: Iterable<string | CompletionCandidate>,
  operationNames: Iterable<string | CompletionCandidate> = DATA_OPERATIONS,
  limit = 8,
): CompletionSuggestion[] {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const commandPrefix = value.slice(0, safeCursor).match(/^\/([a-z0-9-]*)$/i)?.[1];
  const commandSuffix = value.slice(safeCursor);

  if (commandPrefix !== undefined && /^[a-z0-9-]*$/i.test(commandSuffix)) {
    return matchingCandidates(commandNames, commandPrefix, limit).map((candidate) => ({
      label: `/${candidate.name}`,
      description: candidate.description,
      kind: "command",
      start: 0,
      end: value.length,
      replacement: `/${candidate.name}`,
    }));
  }

  const beforeCursor = value.slice(0, safeCursor);
  const operationMatch = beforeCursor.match(/\.([a-z0-9]*)$/i);
  if (operationMatch) {
    const operationPrefix = operationMatch[1] ?? "";
    const dotIndex = safeCursor - operationPrefix.length - 1;
    const operationSuffix = value.slice(safeCursor).match(/^[a-z0-9]*/i)?.[0] ?? "";
    if (value.slice(0, dotIndex).trim()) {
      return matchingCandidates(operationNames, operationPrefix, limit).map((candidate) => ({
        label: `.${candidate.name}`,
        description: candidate.description,
        kind: "operation",
        start: dotIndex + 1,
        end: safeCursor + operationSuffix.length,
        replacement: candidate.name,
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
  return matchingCandidates(variableNames, identifierPrefix, limit).map((candidate) => ({
    label: candidate.name,
    description: candidate.description,
    kind: "variable",
    start,
    end,
    replacement: candidate.name,
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

function matchingCandidates(
  candidates: Iterable<string | CompletionCandidate>,
  prefix: string,
  limit: number,
): CompletionCandidate[] {
  const normalizedPrefix = prefix.toLowerCase();
  const unique = new Map<string, CompletionCandidate>();
  for (const candidate of candidates) {
    const normalized = typeof candidate === "string" ? { name: candidate } : candidate;
    const name = normalized.name.toLowerCase();
    if (!unique.has(name)) {
      unique.set(name, { name, description: normalized.description });
    }
  }
  return [...unique.values()]
    .filter(({ name }) => name.startsWith(normalizedPrefix) && name !== normalizedPrefix)
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);
}
