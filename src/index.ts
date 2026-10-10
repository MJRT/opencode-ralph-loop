import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, cpSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  COMPLETION_MARKER,
  FEEDBACK_MARKER,
  hasTerminalSignal,
} from "./completion.ts";
import { RALPH_COMMANDS, STATE_FILENAME } from "./commands.ts";
import { parseState, serializeState, type RalphState } from "./state.ts";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config/opencode");

// Get plugin root directory
function getPluginRoot(): string {
  try {
    // ESM: use import.meta.url
    const __filename = fileURLToPath(import.meta.url);
    return dirname(dirname(__filename)); // Go up from src/ to plugin root
  } catch {
    // Fallback for CJS
    return dirname(__dirname);
  }
}

// Auto-copy skills to opencode config on first run. opencode reads from
// ~/.config/opencode/skills/ (plural). Earlier versions wrote to /skill/
// (singular) — that path is no longer scanned. Slash commands are NOT
// copied here anymore; they self-register via the `config` hook below.
function setupSkills(): void {
  const pluginRoot = getPluginRoot();
  const skillsDir = join(OPENCODE_CONFIG_DIR, "skills");

  const pluginSkillsDir = join(pluginRoot, "skills");
  if (!existsSync(pluginSkillsDir)) return;

  // Skills directories are co-located with command names; deriving from
  // RALPH_COMMANDS keeps the two in lockstep when new commands are added.
  for (const skill of Object.keys(RALPH_COMMANDS)) {
    const srcSkillDir = join(pluginSkillsDir, skill);
    const destSkillDir = join(skillsDir, skill);
    if (existsSync(srcSkillDir) && !existsSync(destSkillDir)) {
      try {
        mkdirSync(destSkillDir, { recursive: true });
        cpSync(srcSkillDir, destSkillDir, { recursive: true });
      } catch {
        // Silent fail
      }
    }
  }
}

// Get state file path (project-relative)
function getStateFile(directory: string): string {
  return join(directory, ".opencode", STATE_FILENAME);
}

// Read state from project directory
function readState(directory: string): RalphState {
  try {
    const stateFile = getStateFile(directory);
    if (existsSync(stateFile)) {
      return parseState(readFileSync(stateFile, "utf-8"));
    }
  } catch {}
  return { active: false, iteration: 0, maxIterations: 100 };
}

// Write state to project directory
function writeState(directory: string, state: RalphState): void {
  try {
    const stateFile = getStateFile(directory);
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, serializeState(state));
  } catch {}
}

// Clear state
function clearState(directory: string): void {
  try {
    const stateFile = getStateFile(directory);
    if (existsSync(stateFile)) unlinkSync(stateFile);
  } catch {}
}

const AUTO_MAX_ITERATIONS = 100;

const AUTO_SYSTEM_PROMPT = `Ralph Loop is active for this OpenCode build session.

Do not end the coding turn with a progress update, implementation summary, plan, or other ordinary prose while work can continue.

When the coding turn legitimately ends, use exactly one terminal form:
- Successful completion: return only ${COMPLETION_MARKER}.
- Important context that cannot be reliably inferred from the final repository state and would materially affect downstream judgment: start with ${FEEDBACK_MARKER} and include only that necessary feedback. Do not include ${COMPLETION_MARKER}.

Routine implementation summaries, completed fixes, passing tests/lint/typecheck, and commit/worktree status are not coding feedback.`;

function hasOrdinaryUserContent(parts: any[]): boolean {
  return parts.some((part) => part?.synthetic !== true && part?.ignored !== true);
}

function buildContinuationPrompt(state: RalphState, iteration: number): string {
  return `[RALPH LOOP - ITERATION ${iteration}/${state.maxIterations}]

当前 coding turn 尚未产生有效的 workflow 终止信号. 立即从当前 session state 继续执行剩余工作.

不要回复确认信息、计划、进度说明, 也不要解释接下来准备做什么. 直接使用工具执行当前最需要的下一步操作.

只要仍可自行推进, 就继续 implementation、debugging、testing 和 verification, 不要因为阶段性进展而停止.

如果上一条 assistant response 已经包含 ${COMPLETION_MARKER} 或 ${FEEDBACK_MARKER}, 只重新返回该 terminal response, 不执行额外工作.

本轮真正结束时只允许以下两类 terminal response:
- 成功完成时默认仅返回 ${COMPLETION_MARKER}.
- 只有存在无法从最终 code/repository state 可靠推断, 且会实质影响 downstream 判断的重要上下文时, 才返回 ${FEEDBACK_MARKER}, marker 后只输出必要 feedback, 且不得包含 ${COMPLETION_MARKER}.

Routine implementation summary, 已完成的修复, tests/lint/typecheck 通过, commit/worktree 状态和其他正常 completion evidence 都不属于 coding feedback.

除此之外不要结束本轮.

${state.prompt ? `Original task:
${state.prompt}` : "Continue from the current session context."}`;
}

async function getAssistantContext(client: any, sessionId: string, messageId: string, directory: string) {
  try {
    const response = await client.session.message({
      path: { id: sessionId, messageID: messageId },
      query: { directory },
    });
    const info = (response as { data?: any }).data?.info;
    if (info?.role !== "assistant") return {};
    return {
      agent: typeof info.mode === "string" ? info.mode : undefined,
      model:
        typeof info.providerID === "string" && typeof info.modelID === "string"
          ? { providerID: info.providerID, modelID: info.modelID }
          : undefined,
    };
  } catch {
    return {};
  }
}

// Check whether the latest assistant response intentionally ended the coding
// turn. Ordinary prose is not terminal: it may be a premature idle.
async function hasTerminalResponse(client: any, sessionId: string, directory: string): Promise<boolean> {
  try {
    const response = await client.session.messages({
      path: { id: sessionId },
      query: { directory }
    });

    const messages = (response as { data?: any[] }).data ?? [];

    // Filter for assistant messages
    const assistantMessages = messages.filter(
      (msg: any) => msg.info?.role === "assistant"
    );

    if (assistantMessages.length === 0) return false;

    // Check the last assistant message
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    const parts = lastAssistant.parts || [];

    // Extract text from all text parts
    const responseText = parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text ?? "")
      .join("\n");

    return hasTerminalSignal(responseText);
  } catch {
    // Silent fail
  }

  return false;
}

// Main plugin
export default async function RalphLoopPlugin(ctx: any) {
  const directory = ctx.directory || process.cwd();
  const client = ctx.client;
  const continuedMessageIds = new Set<string>();
  const terminalMessageIds = new Set<string>();

  // Auto-setup skills on first run. Slash commands self-register via the
  // `config` hook below.
  setupSkills();

  return {
    // Self-register slash commands. opencode's `config` hook fires while
    // assembling the runtime config; mutating `input.command` adds entries
    // to the command dict, no file copying needed. User-defined entries in
    // opencode.json take precedence (we only set absent names).
    config: async (input: any) => {
      input.command = input.command ?? {};
      for (const [name, def] of Object.entries(RALPH_COMMANDS)) {
        if (!input.command[name]) input.command[name] = def;
      }
    },

    // Build sessions are protected automatically. Synthetic continuation
    // messages are internal Ralph traffic and must not reset loop state.
    "chat.message": async (
      input: { sessionID: string; agent?: string },
      output: { parts: any[] },
    ) => {
      if (input.agent !== "build") return;
      if (!hasOrdinaryUserContent(output.parts ?? [])) return;

      const current = readState(directory);
      if (current.active && current.sessionId === input.sessionID) return;
      if (current.active && current.sessionId && current.sessionId !== input.sessionID) return;

      continuedMessageIds.clear();
      terminalMessageIds.clear();
      writeState(directory, {
        active: true,
        iteration: 0,
        maxIterations: AUTO_MAX_ITERATIONS,
        sessionId: input.sessionID,
      });
    },

    // Keep the terminal contract owned by the plugin rather than requiring
    // callers or task prompts to mention Ralph.
    "experimental.chat.system.transform": async (
      input: { sessionID?: string },
      output: { system: string[] },
    ) => {
      const state = readState(directory);
      if (!state.active) return;
      if (input.sessionID && state.sessionId && input.sessionID !== state.sessionId) return;
      if (!output.system.includes(AUTO_SYSTEM_PROMPT)) {
        output.system.push(AUTO_SYSTEM_PROMPT);
      }
    },

    // Register tools using the @opencode-ai/plugin SDK format.
    // The `args` field (Zod schema shape) is required — opencode calls
    // Object.entries(tool.args) internally. Using the old JSON Schema
    // `parameters` field left `args` undefined and caused a crash:
    //   TypeError: Object.entries requires that input parameter not be null or undefined
    tool: {
      "ralph-loop": tool({
        description: "Start Ralph Loop - prevents premature idle during a coding turn. Use: /ralph-loop <task description>",
        args: {
          task: tool.schema.string().describe("The task to work on until completion"),
          maxIterations: tool.schema.number().default(100).describe("Maximum iterations (default: 100)"),
        },
        async execute({ task, maxIterations = 100 }) {
          continuedMessageIds.clear();
          terminalMessageIds.clear();
          const current = readState(directory);
          const state: RalphState = {
            active: true,
            iteration: 0,
            maxIterations,
            sessionId: current.sessionId,
            prompt: task,
          };
          writeState(directory, state);

          return `Ralph Loop started (max ${maxIterations} iterations).

Task: ${task}

I will auto-continue while the coding turn ends without a valid workflow signal.

Valid terminal responses:
- \`${COMPLETION_MARKER}\` when there is no important coding feedback
- \`${FEEDBACK_MARKER}\` followed by the necessary coding feedback

Use /cancel-ralph to stop early.`;
        }
      }),

      "cancel-ralph": tool({
        description: "Cancel active Ralph Loop",
        args: {},
        async execute() {
          const state = readState(directory);
          if (!state.active) {
            return "No active Ralph Loop to cancel.";
          }
          const iterations = state.iteration;
          clearState(directory);
          continuedMessageIds.clear();
          terminalMessageIds.clear();
          return `Ralph Loop cancelled after ${iterations} iteration(s).`;
        }
      }),

      "help": tool({
        description: "Show Ralph Loop plugin help",
        args: {},
        async execute() {
          return `# Ralph Loop Help

## Available Commands

- \`/ralph-loop <task>\` - Start an auto-continuation loop
- \`/cancel-ralph\` - Stop an active loop

## How It Works

1. Start with: /ralph-loop "Build a REST API"
2. AI works on the task until a terminal response
3. Plugin queues continuation before an unmarked response can become idle
4. Loop stops when the response contains ${COMPLETION_MARKER} or ${FEEDBACK_MARKER}

## State File

Located at: .opencode/ralph-loop.local.md`;
        }
      })
    },

    // Prevent premature idle inside OpenCode's own runner. text.complete is
    // awaited before the V1 loop decides whether to stop, and noReply appends
    // the continuation user message without starting a nested runner.
    "experimental.text.complete": async (
      input: { sessionID: string; messageID: string; partID: string },
      output: { text: string },
    ) => {
      const state = readState(directory);
      if (!state.active) return;
      if (state.sessionId && state.sessionId !== input.sessionID) return;

      if (hasTerminalSignal(output.text)) {
        terminalMessageIds.add(input.messageID);
        return;
      }
      if (terminalMessageIds.has(input.messageID)) return;
      if (continuedMessageIds.has(input.messageID)) return;

      if (state.iteration >= state.maxIterations) {
        clearState(directory);
        return;
      }

      const iteration = state.iteration + 1;
      const continuationPrompt = buildContinuationPrompt(state, iteration);
      const assistant = await getAssistantContext(
        client,
        input.sessionID,
        input.messageID,
        directory,
      );

      try {
        await client.session.prompt({
          path: { id: input.sessionID },
          query: { directory },
          body: {
            noReply: true,
            ...(assistant.agent ? { agent: assistant.agent } : {}),
            ...(assistant.model ? { model: assistant.model } : {}),
            // V1 keeps synthetic text model-visible while status integrations can
            // ignore this internal prompt for external turn attribution.
            parts: [{ type: "text", text: continuationPrompt, synthetic: true }],
          },
        });
        continuedMessageIds.add(input.messageID);
        writeState(directory, {
          ...state,
          iteration,
          sessionId: input.sessionID,
        });
      } catch {
        // A failed pre-idle admission is left visible as a normal completion.
      }
    },

    // Idle no longer drives continuation: doing so races other idle consumers
    // such as Orca. It only retires completed or otherwise ended loop state.
    event: async ({ event }: { event: { type: string; properties?: { sessionID?: string } } }) => {
      if (event.type === "session.idle") {
        const sessionId = event.properties?.sessionID;
        const state = readState(directory);

        if (!state.active) return;
        if (!sessionId) return;
        if (state.sessionId && state.sessionId !== sessionId) return;

        if (await hasTerminalResponse(client, sessionId, directory)) {
          clearState(directory);
          continuedMessageIds.clear();
          terminalMessageIds.clear();
          return;
        }

        if (state.iteration >= state.maxIterations) {
          clearState(directory);
          continuedMessageIds.clear();
          terminalMessageIds.clear();
          return;
        }

        // Reaching idle without a terminal signal means pre-idle admission did
        // not keep the runner alive. Do not restart from idle and recreate the
        // completion race this plugin is intended to prevent.
        clearState(directory);
        continuedMessageIds.clear();
        terminalMessageIds.clear();
      }

      if (event.type === "session.deleted") {
        clearState(directory);
        continuedMessageIds.clear();
        terminalMessageIds.clear();
      }
    }
  };
}
