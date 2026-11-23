// start_agent from the page: the task goes to the team board as a TASK post, which a board worker
// (scripts/board-worker.sh) turns into a PR. On your own machine, `coworker run` does the same from the terminal.

// Board workers run Claude Code, so a board task always goes to Claude.
export const boardTask = (owner: string, task: string, agent: string) => `TASK for ${owner}'s Claude: ${task}${agent === "codex" ? " (asked for Codex)" : ""}`;
