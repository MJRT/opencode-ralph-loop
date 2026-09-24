import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import RalphLoopPlugin from "../src/index.ts";

const TOOL_NAMES = ["ralph-loop", "cancel-ralph", "help"] as const;

describe("RalphLoopPlugin", () => {
  it("returns tool and event handlers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    expect(result.tool).toBeDefined();
    expect(typeof result.event).toBe("function");
  });

  // Regression test for issue #4: opencode's ToolRegistry calls
  // Object.entries(tool.args) when resolving tools. If `args` is undefined
  // (e.g. because someone reverted to the old JSON-Schema `parameters` form),
  // every session prompt crashes with:
  //   TypeError: Object.entries requires that input parameter not be null or undefined
  it.each(TOOL_NAMES)("tool %s has an Object.entries-safe args shape", async (name) => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    const def = (result.tool as Record<string, { args: unknown; execute: unknown }>)[name];

    expect(def, `tool "${name}" not registered`).toBeDefined();
    expect(def.args, `tool "${name}" is missing args (would crash opencode 1.14+)`).toBeDefined();
    expect(() => Object.entries(def.args as object)).not.toThrow();
    expect(typeof def.execute).toBe("function");
  });

  it("ralph-loop tool writes state when executed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    const ralphLoop = (result.tool as any)["ralph-loop"];
    const output = await ralphLoop.execute({ task: "test task", maxIterations: 5 });

    expect(output).toContain("Ralph Loop started");
    expect(output).toContain("test task");

    const stateFile = join(directory, ".opencode", "ralph-loop.local.md");
    expect(existsSync(stateFile)).toBe(true);
    const contents = readFileSync(stateFile, "utf-8");
    expect(contents).toContain("active: true");
    expect(contents).toContain("maxIterations: 5");
    expect(contents).toContain("test task");
  });

  it("cancel-ralph reports no active loop when state is empty", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    const cancelRalph = (result.tool as any)["cancel-ralph"];
    const output = await cancelRalph.execute();

    expect(output).toBe("No active Ralph Loop to cancel.");
  });

  it.each([
    ["completion", "Finished. 👌"],
    ["coding feedback", "Blocked. <<<CODING_FEEDBACK>>>\nNeed external data."],
  ])("stops on %s marker using includes semantics", async (_name, assistantText) => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn();
    const client = {
      session: {
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: assistantText }],
            },
          ],
        }),
        prompt,
      },
    };
    const result = await RalphLoopPlugin({ directory, client });

    await (result.tool as any)["ralph-loop"].execute({
      task: "test task",
      maxIterations: 5,
    });
    await result.event({
      event: { type: "session.idle", properties: { sessionID: "ses_test" } },
    });

    expect(prompt).not.toHaveBeenCalled();
    expect(existsSync(join(directory, ".opencode", "ralph-loop.local.md"))).toBe(false);
  });

  it("continues an unmarked idle with a work-first prompt", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn().mockResolvedValue(undefined);
    const client = {
      session: {
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: "Implemented part one. Next I should run tests." }],
            },
          ],
        }),
        prompt,
      },
    };
    const result = await RalphLoopPlugin({ directory, client });

    await (result.tool as any)["ralph-loop"].execute({
      task: "finish the implementation",
      maxIterations: 5,
    });
    await result.event({
      event: { type: "session.idle", properties: { sessionID: "ses_test" } },
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    const continuation = prompt.mock.calls[0][0].body.parts[0].text as string;
    expect(continuation).toContain("直接使用工具执行当前最需要的下一步操作");
    expect(continuation).toContain("<<<CODING_FEEDBACK>>>");
    expect(continuation).toContain("👌");
    expect(continuation).not.toContain("<promise>DONE</promise>");

    const state = readFileSync(
      join(directory, ".opencode", "ralph-loop.local.md"),
      "utf-8",
    );
    expect(state).toContain("iteration: 1");
    expect(state).toContain("sessionId: ses_test");
  });
});
