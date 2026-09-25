---
description: Start Ralph Loop - prevents premature idle during a coding turn
---

# Ralph Loop

Start an iterative development loop that prevents premature idle during a coding turn.

## Setup

Create the state file in the project directory:

```bash
mkdir -p .opencode && cat > .opencode/ralph-loop.local.md << 'EOF'
---
active: true
iteration: 0
maxIterations: 100
---

$ARGUMENTS
EOF
```

## Task

Now begin working on the task: **$ARGUMENTS**

## Terminal response protocol

Do not stop while you can still make progress yourself. A coding turn may end only with one of these workflow signals:

1. Successful completion defaults to returning only `👌`.
2. Only when there is important context that cannot be reliably inferred from the final code/repository state and would materially affect downstream judgment, return `<<<CODING_FEEDBACK>>>` followed by only the necessary feedback. Do not include `👌`.

Routine implementation summaries, completed fixes, passing tests/lint/typecheck, commit/worktree status, and other normal completion evidence are not coding feedback.

Any response containing neither marker is treated as a premature idle and will be continued automatically.

## Cancellation

Use `/cancel-ralph` to stop early.
