// Single source of truth for the voice agent's tools. Pure data: no imports,
// so scripts/sync-agent.ts can import it under plain Node.
export const TOOL_SPECS = [
  {
    name: "repo_overview",
    description:
      "Get a spoken-style overview of the repo: description, default branch, open issue and pull request counts, main languages, and the start of the README. Use for 'what is this repo' questions.",
    write: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "recent_activity",
    description:
      "Summarize what the team did in the last N hours: commits on the default branch, pull requests opened or merged, issues opened or closed, and who did them. Use for 'what did we push since 11' or 'what happened today'. Convert times like 'since 11' into hours before calling.",
    write: false,
    parameters: {
      type: "object",
      properties: {
        hours: {
          type: "integer",
          description: "How many hours back to look. Defaults to 24. Maximum 720.",
        },
      },
    },
  },
  {
    name: "list_items",
    description:
      "List issues and/or pull requests, newest first. Filter by open or closed, assignee, or label.",
    write: false,
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["issue", "pr", "all"],
          description: "issue for issues only, pr for pull requests only, all for both. Defaults to all.",
        },
        state: {
          type: "string",
          enum: ["open", "closed"],
          description: "Defaults to open.",
        },
        assignee: {
          type: "string",
          description: "GitHub username to filter by assignee. Optional.",
        },
        label: {
          type: "string",
          description: "Label name to filter by. Optional.",
        },
        limit: {
          type: "integer",
          description: "How many items to return. Defaults to 8. Maximum 20.",
        },
      },
    },
  },
  {
    name: "read_item",
    description:
      "Read one issue or pull request by number: title, state, author, description, and the last few comments. For pull requests also says whether it merged and how many files changed.",
    write: false,
    parameters: {
      type: "object",
      required: ["number"],
      properties: {
        number: { type: "integer", description: "The issue or pull request number." },
      },
    },
  },
  {
    name: "search_code",
    description: "Search the repo's code for a word or phrase and return the top matching file paths.",
    write: false,
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Words or identifier to search for." },
      },
    },
  },
  {
    name: "read_file",
    description:
      "Read the start of one file in the repo, or list a folder. Use after search_code or when the user names a file.",
    write: false,
    parameters: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Path from the repo root, for example src/index.ts." },
      },
    },
  },
  {
    name: "board_digest",
    description:
      "Spoken digest of the team's agent board (the pinned GitHub issue where every teammate's coding agent posts): who posted, what each agent finished, what is blocked or waiting, and which posts mention the user. Use for 'what are the agents up to', 'catch me up', or 'anything blocked'. Convert times like 'since 10' into minutes before calling.",
    write: false,
    parameters: {
      type: "object",
      properties: {
        since_minutes: {
          type: "integer",
          description: "How many minutes back to look. Defaults to 60. Maximum 1440.",
        },
        board: {
          type: "integer",
          description: "Board issue number. Optional: defaults to the repo's board issue.",
        },
      },
    },
  },
  {
    name: "board_post",
    description:
      "Post a message on the agent board as the user's relay, so the coding agents see it. Use it to pass the user's answer to an agent that asked for help. WRITE ACTION: first read the message back to the user in a few words and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "The message, in plain text. Name the agent it is for, for example: Eithan's Codex, return 202." },
        to: {
          type: "string",
          description: "GitHub login to mention, without the @. Use the login from the board alert, or all for everyone. Optional.",
        },
        board: {
          type: "integer",
          description: "Board issue number. Optional: defaults to the repo's board issue.",
        },
      },
    },
  },
  {
    name: "answer_request",
    description:
      "Answer a coding agent's request from the board: a permission alert that says 'needs approval (req X)', or a stuck alert that says 'stuck: ... (req X)'. Posts your allow, deny or stop so the agent proceeds, is refused, or is halted. Always use the req id of the alert you just asked about. WRITE ACTION: your spoken question ('Allow?' or 'Want me to stop it?') is the confirmation, so call it as soon as the user says yes or no, without reading it back first. Afterwards say the decision word.",
    write: true,
    parameters: {
      type: "object",
      required: ["request_id", "decision"],
      properties: {
        request_id: { type: "string", description: "The id after 'req' in the alert, for example 3fa9c1." },
        decision: { type: "string", enum: ["allow", "deny", "stop"], description: "allow to let the agent run it, deny to refuse a permission request, stop to halt an agent that is stuck in a loop." },
        note: { type: "string", description: "Short reason to pass to the agent, for example 'wrong folder'. Optional." },
        board: { type: "integer", description: "Board issue number. Optional: defaults to the repo's board issue." },
      },
    },
  },
  {
    name: "create_issue",
    description:
      "Open a new issue in the repo. WRITE ACTION: first say the title back in a few words and get an explicit yes. Afterwards say its number.",
    write: true,
    parameters: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", description: "Short issue title in the user's words." },
        body: { type: "string", description: "Details: steps, expected and actual behavior. Optional." },
        labels: { type: "string", description: "Comma-separated label names. Optional." },
        assignees: { type: "string", description: "Comma-separated GitHub logins. Optional." },
      },
    },
  },
  {
    name: "comment",
    description: "Comment on an issue or pull request. WRITE ACTION: first say the comment back in a few words and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["number", "text"],
      properties: {
        number: { type: "integer", description: "The issue or pull request number." },
        text: { type: "string", description: "The comment, in plain text." },
      },
    },
  },
  {
    name: "set_state",
    description: "Close or reopen an issue or pull request. WRITE ACTION: first say what you will close or reopen and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["number", "state"],
      properties: {
        number: { type: "integer", description: "The issue or pull request number." },
        state: { type: "string", enum: ["open", "closed"], description: "closed to close it, open to reopen it." },
        reason: { type: "string", enum: ["completed", "not_planned"], description: "Why an issue is closed. Optional, defaults to completed." },
      },
    },
  },
  {
    name: "create_pr",
    description:
      "Open a pull request from an existing branch. WRITE ACTION: first say the branch and title back and get an explicit yes. To have code written first, use start_agent instead: it opens its own pull request.",
    write: true,
    parameters: {
      type: "object",
      required: ["head", "title"],
      properties: {
        head: { type: "string", description: "The branch with the changes." },
        title: { type: "string", description: "Pull request title." },
        base: { type: "string", description: "Branch to merge into. Optional: defaults to the repo's default branch." },
        body: { type: "string", description: "Description. Optional." },
        draft: { type: "string", enum: ["yes", "no"], description: "yes to open it as a draft. Optional, defaults to no." },
      },
    },
  },
  {
    name: "merge_pr",
    description:
      "Merge a pull request. WRITE ACTION: merging cannot be undone from here, so first say 'Merge number N, <title>?' and wait for an explicit yes. Squash by default.",
    write: true,
    parameters: {
      type: "object",
      required: ["number"],
      properties: {
        number: { type: "integer", description: "The pull request number." },
        method: { type: "string", enum: ["squash", "merge", "rebase"], description: "How to merge. Optional, defaults to squash." },
      },
    },
  },
  {
    name: "review_pr",
    description: "Approve a pull request, request changes, or leave a review comment. WRITE ACTION: first say the verdict back and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["number", "verdict"],
      properties: {
        number: { type: "integer", description: "The pull request number." },
        verdict: { type: "string", enum: ["approve", "request_changes", "comment"], description: "The review verdict." },
        text: { type: "string", description: "Review text. Required for request_changes and comment." },
      },
    },
  },
  {
    name: "update_item",
    description: "Add or remove labels, or assign people, on an issue or pull request. WRITE ACTION: first say the change back and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["number"],
      properties: {
        number: { type: "integer", description: "The issue or pull request number." },
        add_labels: { type: "string", description: "Comma-separated labels to add. Optional." },
        remove_labels: { type: "string", description: "Comma-separated labels to remove. Optional." },
        assignees: { type: "string", description: "Comma-separated GitHub logins to assign. Optional." },
      },
    },
  },
  {
    name: "start_agent",
    description:
      "Start a coding agent (Claude Code or Codex) on a task. It works in its own worktree on this Mac, can ask the user questions while it runs, and opens a pull request when done. Without the Mac app the task goes to the team board for a board worker. First say the task back in a few words and get an explicit yes. Afterwards say it started; never read the run id aloud.",
    write: false,
    local: true,
    parameters: {
      type: "object",
      required: ["task"],
      properties: {
        task: { type: "string", description: "What to build or fix, in the user's words, specific enough to act on." },
        agent: { type: "string", enum: ["claude", "codex"], description: "Which agent. Optional, defaults to claude." },
      },
    },
  },
  {
    name: "list_agents",
    description: "List the coding agents started from here: what each is doing, running, done (with its pull request number) or failed. Use for 'how are my agents doing' or 'is it done'.",
    write: false,
    local: true,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "stop_agent",
    description: "Stop a running coding agent started from here. Call list_agents first to get its id. First ask 'Stop the agent working on <task>?' and wait for a yes.",
    write: false,
    local: true,
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "The run id from list_agents." } },
    },
  },
  {
    name: "show_me",
    description:
      "Put a board alert's context on the user's screen as a full-screen card: what the agent is doing, the command, the diff and the file. Use when the user says 'show me', 'let me see', 'pull it up' or asks about the diff. Afterwards say one short line like \"Here's the diff.\" and never read the diff aloud. It runs in the browser, so it is instant and needs no GitHub call.",
    write: false,
    local: true,
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Agent name from the alert, for example Eithan's Claude. Optional: defaults to the most recent alert." },
        req: { type: "string", description: "The id after 'req' in the alert. Optional." },
      },
    },
  },
] as const;

export type ToolSpec = (typeof TOOL_SPECS)[number];
export type ToolName = ToolSpec["name"];
// Local tools run in the browser: no /api/tool route, no server handler.
export type LocalToolName = Extract<ToolSpec, { local: true }>["name"];
export type ServerToolName = Exclude<ToolName, LocalToolName>;
