---
name: ralph-loop
description: Start Ralph Loop - prevents premature idle during a coding turn
---

# Ralph Loop

OpenCode `build` sessions are protected automatically. Use this skill for explicit loop control when needed.

## How It Works

The Ralph Loop creates a continuous feedback cycle for completing complex tasks:

1. You work on the task until a terminal response
2. The plugin checks completed assistant text before OpenCode can publish idle
3. If the response has no workflow terminal signal, it prompts you to resume actual work
4. This repeats until you output a terminal signal or max iterations is reached

Your previous work remains accessible through files and git history, enabling progressive refinement across iterations.

## Explicit Loop Override

When you invoke this skill, replace the state file in the project directory:

```bash
mkdir -p .opencode && cat > .opencode/ralph-loop.local.md << 'EOF'
---
active: true
iteration: 0
maxIterations: 100
---

[The user's task prompt goes here]
EOF
```

Then inform the user and begin working on the task.

## Terminal response protocol

Do not stop after a progress update, plan, partial implementation, or a problem you can still solve yourself.

When the coding turn legitimately ends, use exactly one workflow signal:

- Successful completion defaults to returning only `👌`.
- Only when there is important context that cannot be reliably inferred from the final code/repository state and would materially affect downstream judgment, return `<<<CODING_FEEDBACK>>>` followed by only the necessary feedback. Do not include `👌`.

Routine implementation summaries, completed fixes, passing tests/lint/typecheck, commit/worktree status, and other normal completion evidence are not coding feedback.

Any response containing neither marker is considered a premature idle.

The loop can only be stopped by:
1. A valid workflow terminal signal
2. Max iterations reached
3. User running `/cancel-ralph`

## Checking Status

Check current iteration:
```bash
grep '^iteration:' .opencode/ralph-loop.local.md
```

## State File Format

The state file at `.opencode/ralph-loop.local.md` uses YAML frontmatter:

```markdown
---
active: true
iteration: 3
maxIterations: 100
sessionId: ses_abc123
---

Your original task prompt
```

Add `.opencode/ralph-loop.local.md` to your `.gitignore`.
