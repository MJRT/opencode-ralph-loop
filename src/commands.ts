// Non-function constants live here (not in index.ts) so opencode's plugin
// loader — which iterates Object.values(module) and rejects anything that
// isn't a function or {server: fn} — never sees them as exports of the
// entrypoint. See AGENTS.md gotcha.

export const STATE_FILENAME = "ralph-loop.local.md";
export const STATE_DIR = ".opencode";
export const STATE_PATH = `${STATE_DIR}/${STATE_FILENAME}`;

export interface RalphCommandDef {
  description: string;
  template: string;
  agent: string;
}

// Inline slash-command templates. Mirror what commands/*.md used to be,
// minus the per-file YAML frontmatter. Registered at runtime via the
// config hook in index.ts.
export const RALPH_COMMANDS: Record<string, RalphCommandDef> = {
  "ralph-loop": {
    description: "Start Ralph Loop - prevents premature idle during a coding turn",
    template: `Start an iterative development loop that prevents premature idle during this coding turn.

Create the state file in the project directory:

\`\`\`bash
mkdir -p ${STATE_DIR} && cat > ${STATE_PATH} << 'EOF'
---
active: true
iteration: 0
maxIterations: 100
---

$ARGUMENTS
EOF
\`\`\`

Now begin working on the task: **$ARGUMENTS**

Do not stop after a progress update, plan, partial implementation, failed check that you can fix, or any other state where you can continue working yourself.

When this coding turn legitimately ends, use exactly one of these workflow output forms:

1. Successful completion defaults to returning only \`👌\`.
2. Only when there is important context that cannot be reliably inferred from the final code/repository state and would materially affect downstream judgment, return \`<<<CODING_FEEDBACK>>>\` followed by only the necessary feedback. Do not include \`👌\`.

Routine implementation summaries, completed fixes, passing tests/lint/typecheck, commit/worktree status, and other normal completion evidence are not coding feedback.

Any response containing neither marker is considered a premature idle and will be continued automatically.

Use \`/cancel-ralph\` to stop early.`,
    agent: "build",
  },
  "cancel-ralph": {
    description: "Cancel active Ralph Loop",
    template: `Cancel the active Ralph Loop.

\`\`\`bash
if [ -f ${STATE_PATH} ]; then
  grep '^iteration:' ${STATE_PATH}
  rm -f ${STATE_PATH}
  echo "Ralph Loop cancelled."
else
  echo "No active Ralph Loop to cancel."
fi
\`\`\`

Report the result to the user.`,
    agent: "build",
  },
  "help": {
    description: "Show Ralph Loop plugin help and available commands",
    template: `# Ralph Loop Help

## Available Commands

- \`/ralph-loop <task>\` - Start an auto-continuation loop for the given task
- \`/cancel-ralph\` - Stop an active Ralph Loop

## Quick Start

\`\`\`
/ralph-loop Build a REST API with user authentication
\`\`\`

The AI will work on your task and automatically continue whenever it idles without a valid workflow terminal signal.

## How It Works

1. Creates state file at \`${STATE_PATH}\`
2. Works on task until idle
3. If neither \`👌\` nor \`<<<CODING_FEEDBACK>>>\` is found, auto-continues
4. Repeats until a terminal signal is found or max iterations (100) is reached

For more details, the AI can use the \`help\` skill.`,
    agent: "build",
  },
};
