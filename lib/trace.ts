// Audit trail on TraceRoot (traceroot.ai). Every decision the coworker makes for a user's coding
// agents becomes one span: the alert it saw, the tool it ran, the allow/deny/stop it posted, how
// long it took and how it ended. Voice approvals need that accountability.
//
// Off unless TRACEROOT_API_KEY is set (TRACEROOT_ENABLED=false forces it off): then audited() only
// runs the function and the SDK is never loaded. Server-side only. Only spans named "coworker.*"
// leave the process, so Next.js's own request spans are dropped.
import type * as Sdk from "@traceroot-ai/traceroot";

type Attr = string | number | boolean;
type Attrs = Record<string, Attr | undefined>;
export type Audit = { set(update: { input?: unknown; output?: unknown; attrs?: Attrs }): void };

const PREFIX = "coworker.";
const LIMIT = 500;

export const clip = (s: string, max = LIMIT) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export const clipValues = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? clip(v) : v]));

const enabled = () => !!process.env.TRACEROOT_API_KEY && process.env.TRACEROOT_ENABLED !== "false";
const defined = (a: Attrs = {}) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== "")) as Record<string, Attr>;

// 2xx ok, 401/403 blocked, 429 rate_limited, other 4xx invalid, 5xx error.
export const outcomeOf = (status: number) => (status < 400 ? "ok" : status === 401 || status === 403 ? "blocked" : status === 429 ? "rate_limited" : status < 500 ? "invalid" : "error");

let sdk: Promise<typeof Sdk | null> | undefined;

function load(): Promise<typeof Sdk | null> {
  if (!enabled()) return Promise.resolve(null);
  sdk ??= (async () => {
    try {
      const m = await import("@traceroot-ai/traceroot");
      m.TraceRoot.initialize({ instrumentModules: {}, exportSpan: (s) => s.name.startsWith(PREFIX) });
      return m;
    } catch (e) {
      console.error("TraceRoot is off:", e instanceof Error ? e.message : "unknown error");
      return null;
    }
  })();
  return sdk;
}

// Spans are batched, and a serverless host can freeze before the batch goes out, so send them once
// the response is on its way. Outside a request (tests, scripts) send them now.
async function flushSoon(t: typeof Sdk) {
  const flush = () => t.TraceRoot.flush().catch((e) => console.error("TraceRoot flush failed:", e instanceof Error ? e.message : "unknown error"));
  try {
    (await import("next/server")).after(flush);
  } catch {
    await flush();
  }
}

// Runs fn inside a span called `coworker.<name>`. A Response result also records its status, its
// outcome and its `result` or `error` text, so a route only has to say what the call was.
export async function audited<T>(name: string, attrs: Attrs, fn: (a: Audit) => Promise<T>): Promise<T> {
  const t = await load();
  if (!t) return fn({ set() {} });
  const t0 = Date.now();
  try {
    return await t.observe({ name: PREFIX + name, type: "tool", captureInput: false, captureOutput: false }, async () => {
      const a: Audit = { set: (u) => t.updateCurrentSpan({ input: u.input, output: u.output, attributes: defined(u.attrs) }) };
      t.updateCurrentSpan({ attributes: defined(attrs) });
      try {
        const res = await fn(a);
        if (res instanceof Response) {
          const body = (await res.clone().json().catch(() => ({}))) as { result?: unknown; error?: unknown };
          const text = body.result ?? body.error;
          a.set({ output: typeof text === "string" ? clip(text) : undefined, attrs: { status: res.status, outcome: outcomeOf(res.status) } });
        } else a.set({ attrs: { outcome: "ok" } });
        return res;
      } catch (e) {
        a.set({ output: e instanceof Error ? clip(e.message) : "unknown error", attrs: { outcome: "error" } });
        throw e;
      } finally {
        a.set({ attrs: { duration_ms: Date.now() - t0 } });
      }
    });
  } finally {
    await flushSoon(t);
  }
}
