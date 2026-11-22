import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const fail = (status: number, error: string) => Response.json({ error }, { status });
const LOCAL = /^(?:localhost|127\.0\.0\.1|\[::1\])$/;

const hostOf = (v: string | null) => {
  try {
    return v ? new URL(v.includes("://") ? v : `http://${v}`) : null;
  } catch {
    return null;
  }
};

// POST { cwd, file, line? } opens the file in the editor on the machine that runs this server.
// That only makes sense (and is only safe) when the browser and the server are the same laptop,
// so it refuses anything that is not a same-origin request to localhost.
export async function POST(req: Request) {
  const host = hostOf(req.headers.get("host"));
  const origin = hostOf(req.headers.get("origin"));
  if (!host || !LOCAL.test(host.hostname)) return fail(403, "Open in editor only works when the app runs on localhost.");
  if (!origin || origin.host !== host.host || req.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Open in editor only accepts requests from this app.");
  if (!req.headers.get("content-type")?.includes("application/json")) return fail(415, "Send JSON.");

  let body: { cwd?: unknown; file?: unknown; line?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Request body must be JSON.");
  }
  const { cwd, file, line } = body ?? {};
  if (typeof cwd !== "string" || !isAbsolute(cwd)) return fail(400, "cwd must be an absolute path.");
  if (typeof file !== "string" || !file || file.includes("\0")) return fail(400, "file must be a path.");
  if (line !== undefined && !(typeof line === "number" && Number.isInteger(line) && line > 0)) return fail(400, "line must be a positive whole number.");

  let target: string;
  try {
    const root = await realpath(/*turbopackIgnore: true*/ cwd);
    target = await realpath(/*turbopackIgnore: true*/ resolve(root, file));
    const rel = relative(root, target);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return fail(403, "That file is outside the agent's folder.");
    if (!(await stat(/*turbopackIgnore: true*/ target)).isFile()) return fail(400, "That is not a file.");
  } catch {
    return fail(404, "That file does not exist on this machine.");
  }

  const attempts: [string, string[]][] = [["code", ["-g", `${target}${line ? `:${line}` : ""}`]]];
  if (process.platform === "darwin") attempts.push(["open", ["-t", target]]);
  for (const [cmd, args] of attempts) {
    try {
      await run(cmd, args, { timeout: 10_000 });
      return Response.json({ opened: target, with: cmd });
    } catch (e) {
      console.warn(`open: ${cmd} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return fail(502, "Could not start an editor. Install the `code` command, or open the file yourself.");
}
