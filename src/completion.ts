// Lives outside src/index.ts on purpose. opencode's plugin loader iterates
// Object.values(module) of the entrypoint and rejects non-function runtime
// exports. Keep protocol constants in this sibling module.
export const COMPLETION_MARKER = "👌";
export const FEEDBACK_MARKER = "<<<CODING_FEEDBACK>>>";

export function hasTerminalSignal(responseText: string): boolean {
  return (
    responseText.includes(COMPLETION_MARKER) ||
    responseText.includes(FEEDBACK_MARKER)
  );
}
