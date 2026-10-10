---
description: Show Ralph Loop plugin help and available commands
---

# Ralph Loop Help

## Available Commands

- `/ralph-loop <task>` - Override the tracked task / iteration loop explicitly
- `/cancel-ralph` - Stop the active Ralph Loop

OpenCode `build` sessions arm Ralph automatically. Normal task prompts do not need to mention Ralph.

## How It Works

1. Ordinary `build` user messages create state at `.opencode/ralph-loop.local.md`
2. The plugin injects the terminal contract through OpenCode's system hook
3. If neither `👌` nor `<<<CODING_FEEDBACK>>>` is found, queues continuation before idle
4. Repeats until a terminal signal is found or max iterations (100) is reached

## Cancellation

To stop early:
```
/cancel-ralph
```

For more details, the AI can use the `help` skill.
