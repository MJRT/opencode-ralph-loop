import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import RalphLoopPlugin from "../src/index.ts";

const TOOL_NAMES = ["ralph-loop", "cancel-ralph", "help"] as const;

describe("RalphLoopPlugin", () => {
  it("keeps the entrypoint loader-safe", async () => {
    const entrypoint = await import("../src/index.ts");
    expect(Object.keys(entrypoint)).toEqual(["default"]);
  });

  it("returns tool and event handlers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    expect(result.tool).toBeDefined();
    expect(typeof result.event).toBe("function");
    expect(typeof result["chat.message"]).toBe("function");
    expect(typeof result["experimental.chat.system.transform"]).toBe("function");
    expect(typeof result["experimental.text.complete"]).toBe("function");
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

  it("auto-arms ordinary build messages without a Ralph command", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    await result["chat.message"](
      { sessionID: "ses_auto", agent: "build" },
      { parts: [{ type: "text", text: "implement the task" }] },
    );

    const contents = readFileSync(
      join(directory, ".opencode", "ralph-loop.local.md"),
      "utf-8",
    );
    expect(contents).toContain("active: true");
    expect(contents).toContain("iteration: 0");
    expect(contents).toContain("maxIterations: 100");
    expect(contents).toContain("sessionId: ses_auto");
    expect(contents).not.toContain("implement the task");
  });

  it("ignores synthetic continuations and non-build agents when auto-arming", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    await result["chat.message"](
      { sessionID: "ses_synthetic", agent: "build" },
      { parts: [{ type: "text", text: "continue", synthetic: true }] },
    );
    await result["chat.message"](
      { sessionID: "ses_plan", agent: "plan" },
      { parts: [{ type: "text", text: "plan this" }] },
    );

    expect(existsSync(join(directory, ".opencode", "ralph-loop.local.md"))).toBe(false);
  });

  it("does not reset an active auto loop for another ordinary message in the same session", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn().mockResolvedValue(undefined);
    const message = vi.fn().mockResolvedValue({
      data: { info: { role: "assistant", mode: "build" } },
    });
    const result = await RalphLoopPlugin({
      directory,
      client: { session: { message, prompt, messages: vi.fn() } },
    });

    await result["chat.message"](
      { sessionID: "ses_auto", agent: "build" },
      { parts: [{ type: "text", text: "first task" }] },
    );
    await result["experimental.text.complete"](
      { sessionID: "ses_auto", messageID: "msg_one", partID: "part_one" },
      { text: "still working" },
    );
    await result["chat.message"](
      { sessionID: "ses_auto", agent: "build" },
      { parts: [{ type: "text", text: "another user message" }] },
    );

    const contents = readFileSync(
      join(directory, ".opencode", "ralph-loop.local.md"),
      "utf-8",
    );
    expect(contents).toContain("iteration: 1");
    expect(contents).not.toContain("first task");
    expect(contents).not.toContain("another user message");
  });

  it("injects the terminal protocol only for the active session", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const result = await RalphLoopPlugin({ directory, client: {} });

    await result["chat.message"](
      { sessionID: "ses_auto", agent: "build" },
      { parts: [{ type: "text", text: "implement" }] },
    );

    const active = { system: ["base system"] };
    await result["experimental.chat.system.transform"](
      { sessionID: "ses_auto" },
      active,
    );
    expect(active.system).toHaveLength(2);
    expect(active.system[1]).toContain("Ralph Loop is active");
    expect(active.system[1]).toContain("👌");
    expect(active.system[1]).toContain("<<<CODING_FEEDBACK>>>");

    const withoutSessionId = { system: ["base system"] };
    await result["experimental.chat.system.transform"]({}, withoutSessionId);
    expect(withoutSessionId.system).toHaveLength(2);

    const other = { system: ["base system"] };
    await result["experimental.chat.system.transform"](
      { sessionID: "ses_other" },
      other,
    );
    expect(other.system).toEqual(["base system"]);
  });

  it("auto-armed build messages use the pre-idle continuation path", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn().mockResolvedValue(undefined);
    const message = vi.fn().mockResolvedValue({
      data: {
        info: {
          role: "assistant",
          mode: "build",
          providerID: "provider-test",
          modelID: "model-test",
        },
      },
    });
    const result = await RalphLoopPlugin({
      directory,
      client: { session: { message, prompt, messages: vi.fn() } },
    });

    await result["chat.message"](
      { sessionID: "ses_auto", agent: "build" },
      { parts: [{ type: "text", text: "finish the implementation" }] },
    );
    await result["experimental.text.complete"](
      { sessionID: "ses_auto", messageID: "msg_auto", partID: "part_auto" },
      { text: "Implemented part one." },
    );

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0][0]).toMatchObject({
      path: { id: "ses_auto" },
      body: {
        noReply: true,
        agent: "build",
        model: { providerID: "provider-test", modelID: "model-test" },
        parts: [{ type: "text", synthetic: true }],
      },
    });
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

  it("queues an unmarked continuation before idle with noReply", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn().mockResolvedValue(undefined);
    const message = vi.fn().mockResolvedValue({
      data: {
        info: {
          role: "assistant",
          mode: "build",
          providerID: "provider-test",
          modelID: "model-test",
        },
      },
    });
    const client = { session: { message, prompt, messages: vi.fn() } };
    const result = await RalphLoopPlugin({ directory, client });

    await (result.tool as any)["ralph-loop"].execute({
      task: "finish the implementation",
      maxIterations: 5,
    });
    await result["experimental.text.complete"](
      { sessionID: "ses_test", messageID: "msg_test", partID: "part_test" },
      { text: "Implemented part one. Next I should run tests." },
    );

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0][0]).toMatchObject({
      path: { id: "ses_test" },
      query: { directory },
      body: {
        noReply: true,
        agent: "build",
        model: { providerID: "provider-test", modelID: "model-test" },
      },
    });
    expect(prompt.mock.calls[0][0].body.parts[0].synthetic).toBe(true);
    const continuation = prompt.mock.calls[0][0].body.parts[0].text as string;
    expect(continuation).toContain("直接使用工具执行当前最需要的下一步操作");
    expect(continuation).toContain("<<<CODING_FEEDBACK>>>");
    expect(continuation).toContain("👌");

    const state = readFileSync(
      join(directory, ".opencode", "ralph-loop.local.md"),
      "utf-8",
    );
    expect(state).toContain("iteration: 1");
    expect(state).toContain("sessionId: ses_test");

    await result["experimental.text.complete"](
      { sessionID: "ses_test", messageID: "msg_test", partID: "part_2" },
      { text: "Another text part." },
    );
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("does not queue continuation when a terminal marker is present", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn();
    const client = { session: { message: vi.fn(), prompt, messages: vi.fn() } };
    const result = await RalphLoopPlugin({ directory, client });

    await (result.tool as any)["ralph-loop"].execute({ task: "test task", maxIterations: 5 });
    await result["experimental.text.complete"](
      { sessionID: "ses_test", messageID: "msg_test", partID: "part_test" },
      { text: "👌" },
    );

    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not restart an unmarked session from idle", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ralph-loop-plugin-"));
    const prompt = vi.fn();
    const client = {
      session: {
        messages: vi.fn().mockResolvedValue({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: "Still unfinished." }],
            },
          ],
        }),
        prompt,
      },
    };
    const result = await RalphLoopPlugin({ directory, client });

    await (result.tool as any)["ralph-loop"].execute({ task: "test task", maxIterations: 5 });
    await result.event({ event: { type: "session.idle", properties: { sessionID: "ses_test" } } });

    expect(prompt).not.toHaveBeenCalled();
    expect(existsSync(join(directory, ".opencode", "ralph-loop.local.md"))).toBe(false);
  });
});
