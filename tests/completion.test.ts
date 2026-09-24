import { describe, it, expect } from "vitest";
import {
  COMPLETION_MARKER,
  FEEDBACK_MARKER,
  hasTerminalSignal,
} from "../src/completion.ts";

describe("hasTerminalSignal", () => {
  it("accepts completion anywhere in the assistant response", () => {
    expect(hasTerminalSignal(COMPLETION_MARKER)).toBe(true);
    expect(hasTerminalSignal(`Implementation finished. ${COMPLETION_MARKER}`)).toBe(true);
  });

  it("accepts coding feedback anywhere in the assistant response", () => {
    expect(hasTerminalSignal(FEEDBACK_MARKER)).toBe(true);
    expect(
      hasTerminalSignal(
        `External data is required.\n${FEEDBACK_MARKER}\nNo snapshot records are available.`,
      ),
    ).toBe(true);
  });

  it("does not treat ordinary progress text as terminal", () => {
    expect(hasTerminalSignal("Implemented the first part; tests remain.")).toBe(false);
    expect(hasTerminalSignal("I will continue with verification.")).toBe(false);
  });
});
