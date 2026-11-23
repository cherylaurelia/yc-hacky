// Shared helpers for tests/product. Locked by the hill climb: change only with `climb.py relock`.
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

export type Env = Record<string, string>;
export const ROOT = resolve(import.meta.dirname, "../..");
export const MAC = join(ROOT, "macos/Coworker");
const run = promisify(execFile);

export const tmp = (tag: string) => mkdtempSync(join(tmpdir(), `cw-${tag}-`));

// Compiles macos/Coworker/<deps> with tests/product/mac/<spec>.swift and runs it. Exit 0 = pass.
export async function swiftSpec(spec: string, deps: string[]) {
  const missing = deps.filter((d) => !existsSync(join(MAC, d)));
  if (missing.length) throw new Error(`missing ${missing.map((m) => `macos/Coworker/${m}`).join(", ")}`);
  const out = join(tmp("swift"), spec);
  try {
    await run("swiftc", ["-parse-as-library", "-swift-version", "5", ...deps.map((d) => join(MAC, d)), join(ROOT, "tests/product/mac", `${spec}.swift`), "-o", out], { timeout: 240_000 });
  } catch (e) {
    throw new Error(`compile failed:\n${String((e as { stderr?: string }).stderr ?? e).slice(0, 3000)}`);
  }
  try {
    await run(out, [], { timeout: 60_000 });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    throw new Error(`spec failed:\n${(err.stdout ?? "").split("\n").filter((l) => l.startsWith("FAIL")).join("\n")}\n${(err.stderr ?? "").slice(0, 1500)}`);
  }
}

// Swift sources with comments removed, keyed by file name.
export function swiftSources(): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of readdirSync(MAC).filter((f) => f.endsWith(".swift"))) {
    m.set(f, readFileSync(join(MAC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"\\])\/\/.*$/gm, ""));
  }
  return m;
}

// ---------- the coworker CLI ----------

export const CLI = join(ROOT, "bin/coworker");

export type CliResult = { code: number | null; stdout: string; stderr: string; ms: number };

export function cli(args: string[], opts: { env: Env; input?: string; cwd?: string; timeoutMs?: number }): Promise<CliResult> {
  return new Promise((done) => {
    const t0 = Date.now();
    if (!existsSync(CLI)) return done({ code: 127, stdout: "", stderr: "bin/coworker does not exist", ms: 0 });
    const p = spawn(CLI, args, { env: opts.env as unknown as NodeJS.ProcessEnv, cwd: opts.cwd ?? opts.env.HOME });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 20_000);
    p.on("error", (e) => { stderr += String(e); });
    p.on("close", (code) => { clearTimeout(timer); done({ code, stdout, stderr, ms: Date.now() - t0 }); });
    p.stdin.on("error", () => {});
    p.stdin.end(opts.input ?? "");
  });
}

// A sandbox: temp HOME, COWORKER_HOME and CODEX_HOME, a PATH with only bash basics, jq and curl,
// plus a fake `gh` that logs every call (and answers board lookups) when withGh is set.
export function sandbox(withGh = false) {
  const home = tmp("home");
  const bin = join(home, "bin");
  mkdirSync(bin);
  for (const tool of ["jq", "curl", "git", "node"]) {
    for (const dir of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) {
      if (existsSync(join(dir, tool))) { symlinkSync(join(dir, tool), join(bin, tool)); break; }
    }
  }
  const ghLog = join(home, "gh.log");
  if (withGh) {
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${ghLog}"
case "$*" in
  "auth status"*) exit 0 ;;
  "api user"*) echo sam ;;
  *"issues?labels=board"*) echo 4 ;;
  *" -f body="*) echo "100 2026-01-01T00:00:00Z" ;;
  *) echo "" ;;
esac
`, { mode: 0o755 });
  }
  const repo = join(home, "repo");
  mkdirSync(repo);
  const env = {
    HOME: home, COWORKER_HOME: join(home, ".coworker"), CODEX_HOME: join(home, ".codex"),
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, TMPDIR: join(home, "tmp"), LANG: "en_US.UTF-8",
    COWORKER_NAME: "Sam",
  } as Env;
  mkdirSync(env.TMPDIR!);
  return { home, bin, env, repo, ghLog, ghCalls: () => (existsSync(ghLog) ? readFileSync(ghLog, "utf8") : "") };
}

export async function gitRepo(dir: string, env: Env) {
  await run("git", ["init", "-q"], { cwd: dir, env: env as unknown as NodeJS.ProcessEnv });
  await run("git", ["remote", "add", "origin", "https://github.com/acme/widgets.git"], { cwd: dir, env: env as unknown as NodeJS.ProcessEnv });
  await run("git", ["config", "user.name", "Sam Lee"], { cwd: dir, env: env as unknown as NodeJS.ProcessEnv });
}

// ---------- a fake relay that speaks the relay HTTP API (see tests/product/mac/relay.swift) ----------

export type RelayEvt = { id: string; agent: string; kind: string; text: string; [k: string]: unknown };

export async function fakeRelay(coworkerHome: string, token = "test-token") {
  const events: RelayEvt[] = [];
  const answers = new Map<string, string>();
  const waiters = new Map<string, ((a: string) => void)[]>();
  let autoAnswer: string | null = null;
  let autoDelay = 50;
  const give = (id: string, a: string) => {
    answers.set(id, a);
    for (const w of waiters.get(id) ?? []) w(a);
    waiters.delete(id);
  };
  const json = (res: ServerResponse, code: number, body?: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const body = (req: IncomingMessage) => new Promise<Record<string, unknown>>((ok) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } });
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/v1/health") return json(res, 200, { ok: true });
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: "unauthorized" });
    if (req.method === "POST" && url.pathname === "/v1/events") {
      const b = await body(req);
      const id = `e${events.length + 1}`;
      events.push({ ...b, id } as RelayEvt);
      if (autoAnswer !== null) { const a = autoAnswer; setTimeout(() => give(id, a), autoDelay); }
      return json(res, 200, { id });
    }
    const m = url.pathname.match(/^\/v1\/events\/([^/]+)\/answer$/);
    if (m && req.method === "GET") {
      const id = m[1];
      if (answers.has(id)) return json(res, 200, { answer: answers.get(id) });
      const wait = Math.min(Number(url.searchParams.get("wait") ?? 0), 30);
      if (!wait) { res.writeHead(204); return res.end(); }
      const timer = setTimeout(() => { res.writeHead(204); res.end(); }, wait * 1000);
      const list = waiters.get(id) ?? [];
      list.push((a) => { clearTimeout(timer); json(res, 200, { answer: a }); });
      waiters.set(id, list);
      return;
    }
    if (m && req.method === "POST") { give(m[1], String((await body(req)).answer ?? "")); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "not found" });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  mkdirSync(coworkerHome, { recursive: true });
  writeFileSync(join(coworkerHome, "relay.json"), JSON.stringify({ port, token }), { mode: 0o600 });
  return {
    port, events,
    answerWith(a: string | null, delayMs = 50) { autoAnswer = a; autoDelay = delayMs; },
    close: () => new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); }),
  };
}

export const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
