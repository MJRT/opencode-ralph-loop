---
description: Show Ralph Loop plugin help and available commands
---

# Ralph Loop Help

## Available Commands

- `/ralph-loop <task>` - Start an auto-continuation loop for the given task
- `/cancel-ralph` - Stop an active Ralph Loop

## Quick Start

```
/ralph-loop Build a REST API with user authentication
```

The AI will work on your task and automatically continue before an unmarked response can become idle.

## How It Works

1. Creates state file at `.opencode/ralph-loop.local.md`
2. Works on the task until a terminal response
3. If neither `👌` nor `<<<CODING_FEEDBACK>>>` is found, queues continuation before idle
4. Repeats until a terminal signal is found or max iterations (100) is reached

## Cancellation

To stop early:
```
/cancel-ralph
```

For more details, the AI can use the `help` skill.
