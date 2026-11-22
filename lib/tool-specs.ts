// Single source of truth for the voice agent's tools. Pure data: no imports,
// so scripts/sync-agent.ts can import it under plain Node.
export const TOOL_SPECS = [
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
