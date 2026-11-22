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
    name: "create_issue",
    description:
      "Create a new GitHub issue. WRITE ACTION: first read the title and body back to the user and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["title", "body"],
      properties: {
        title: { type: "string", description: "Short issue title." },
        body: { type: "string", description: "Issue description in plain text." },
        assignees: {
          type: "string",
          description: "Comma-separated GitHub usernames to assign. Optional.",
        },
      },
    },
  },
  {
    name: "add_comment",
    description:
      "Comment on an existing issue or pull request. WRITE ACTION: first read the comment back to the user and get an explicit yes.",
    write: true,
    parameters: {
      type: "object",
      required: ["number", "body"],
      properties: {
        number: { type: "integer", description: "The issue or pull request number." },
        body: { type: "string", description: "Comment text in plain text." },
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
      "Answer a coding agent's permission request from the board, an alert that says 'needs approval (req X)'. Posts your allow or deny so the agent proceeds or stops. WRITE ACTION: the spoken question 'Allow?' is the confirmation, so call it as soon as the user says allow or deny, without reading it back first. Afterwards say the decision word.",
    write: true,
    parameters: {
      type: "object",
      required: ["request_id", "decision"],
      properties: {
        request_id: { type: "string", description: "The id after 'req' in the alert, for example 3fa9c1." },
        decision: { type: "string", enum: ["allow", "deny"], description: "allow to let the agent run it, deny to stop it." },
        note: { type: "string", description: "Short reason to pass to the agent, for example 'wrong folder'. Optional." },
      },
    },
  },
] as const;

export type ToolSpec = (typeof TOOL_SPECS)[number];
export type ToolName = ToolSpec["name"];
