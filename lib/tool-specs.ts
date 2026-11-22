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
] as const;

export type ToolSpec = (typeof TOOL_SPECS)[number];
export type ToolName = ToolSpec["name"];
