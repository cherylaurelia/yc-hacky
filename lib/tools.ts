import { boardDigest, boardPost } from "./board-api";
import { GhError } from "./github";
import { TOOL_SPECS, type ServerToolName, type ToolName } from "./tool-specs";

export type Ctx = { repo: string; token?: string };
export type Args = Record<string, string | number | undefined>;
type Handler = (ctx: Ctx, args: Args) => Promise<string>;

const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === "number" ? Math.min(hi, Math.max(lo, Math.trunc(v))) : d;
const str = (v: unknown) => (typeof v === "string" ? v : "");

// ---------- handlers (one per spec name; the type enforces it) ----------

export const HANDLERS: Record<ServerToolName, Handler> = {
  async board_digest({ repo, token }, args) {
    return boardDigest(repo, token, num(args.board, 0, 0, 1e9) || undefined, num(args.since_minutes, 60, 1, 1440));
  },

  async board_post({ repo, token }, args) {
    const text = str(args.text);
    const to = str(args.to).replace(/^@/, "");
    if (to && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(to)) throw new GhError("That is not a GitHub username.", 400);
    return boardPost(repo, token, num(args.board, 0, 0, 1e9) || undefined, text, to);
  },

  // The hooks/coworker-hook.sh poller waits for "req <id> allow|deny|stop" from the gh user.
  async answer_request({ repo, token }, args) {
    const id = str(args.request_id).replace(/^req\s+/i, "").toLowerCase();
    if (!/^[0-9a-f]{4,12}$/.test(id)) throw new GhError("That is not a request id.", 400);
    const decision = args.decision === "deny" || args.decision === "stop" ? args.decision : "allow";
    const note = str(args.note).replace(/\s+/g, " ").slice(0, 300);
    await boardPost(repo, token, num(args.board, 0, 0, 1e9) || undefined, `req ${id} ${decision}${note ? ` ${note}` : ""}`, "");
    return `Sent ${decision} for request ${id}.`;
  },
};

// ---------- argument validation (boundary) ----------

type Prop = { type: "string" | "integer"; enum?: readonly string[] };
const SPECS = new Map(TOOL_SPECS.map((s) => [s.name as string, s]));

export const isToolName = (n: string): n is ServerToolName => SPECS.has(n) && !("local" in SPECS.get(n)!);
export const isWriteTool = (n: ToolName) => SPECS.get(n)!.write;

export function validateArgs(name: ToolName, raw: unknown): { ok: true; args: Args } | { ok: false; error: string } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) return { ok: false, error: "args must be an object." };
  const given = (raw ?? {}) as Record<string, unknown>;
  const p = SPECS.get(name)!.parameters as { required?: readonly string[]; properties: Record<string, Prop> };
  const args: Args = {};
  for (const [key, prop] of Object.entries(p.properties)) {
    let v = given[key];
    if (typeof v === "string") v = v.trim();
    if (v === undefined || v === null || v === "") {
      if (p.required?.includes(key)) return { ok: false, error: `I need a value for ${key}.` };
      continue;
    }
    if (prop.type === "integer") {
      const n = typeof v === "string" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `${key} must be a whole number.` };
      args[key] = n;
    } else {
      if (typeof v !== "string") return { ok: false, error: `${key} must be text.` };
      if (prop.enum && !prop.enum.includes(v)) return { ok: false, error: `${key} must be one of ${prop.enum.join(", ")}.` };
      args[key] = v;
    }
  }
  return { ok: true, args };
}
