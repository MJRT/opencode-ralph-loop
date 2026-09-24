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

1. No important coding feedback: return `👌`.
2. Important coding feedback exists: include `<<<CODING_FEEDBACK>>>`, then only the necessary feedback. Do not include `👌`.

Any response containing neither marker is treated as a premature idle and will be continued automatically.

## Cancellation

Use `/cancel-ralph` to stop early.
