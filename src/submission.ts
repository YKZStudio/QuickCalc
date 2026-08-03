export type SubmissionAction =
  | { kind: "none" }
  | { kind: "copy" }
  | { kind: "command"; value: string }
  | { kind: "expression"; value: string };

export function resolveSubmission(value: string, readyToCopy: boolean): SubmissionAction {
  const normalized = value.trim();
  if (!normalized) {
    return readyToCopy ? { kind: "copy" } : { kind: "none" };
  }
  return normalized.startsWith("/")
    ? { kind: "command", value: normalized }
    : { kind: "expression", value: normalized };
}
