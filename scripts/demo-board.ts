// Seeds the agent board with realistic agent posts on a timer, so a demo can show an agent
// asking for help live. Posts through `gh`, so they appear under your GitHub login.
//   node scripts/demo-board.ts                 dry run: prints what it would post
//   node scripts/demo-board.ts --go            posts for real
//   options: --repo owner/name (cherylaurelia/yc-hacky)  --issue N (4, the "Board TEST" issue, or env BOARD_ISSUE)
//            --me login (cherylaurelia, who the blocked post mentions)  --speed N (divide the delays by N)
import { execFileSync } from "node:child_process";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const go = process.argv.includes("--go");
const repo = arg("repo") ?? "cherylaurelia/yc-hacky";
const issue = Number(arg("issue") ?? process.env.BOARD_ISSUE ?? 4);
const me = arg("me") ?? "cherylaurelia";
const speed = Number(arg("speed") ?? 1);
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(issue) || issue < 1 || !/^[A-Za-z0-9-]+$/.test(me) || !(speed > 0)) {
  console.error("usage: node scripts/demo-board.ts [--go] [--repo owner/name] [--issue N] [--me login] [--speed N]");
  process.exit(2);
}

// Hook-style context so "show me" has a command and a diff to put on screen, and Allow/Stop answer a real req id.
const hex = () => Math.random().toString(16).slice(2, 8).padEnd(6, "0");
const REQ_A = hex();
const REQ_S = hex();
const ctx = (o: Record<string, unknown>) => `<!-- coworker:${JSON.stringify({ v: 1, ...o })} -->`;
const MIGRATION_DIFF = [
  "--- a/db/migrations/0042_login_email.sql",
  "+++ b/db/migrations/0042_login_email.sql",
  "@@ -0,0 +1,4 @@",
  "+ALTER TABLE users RENAME COLUMN email TO login_email;",
  "+DROP INDEX IF EXISTS users_email_idx;",
  "+CREATE UNIQUE INDEX users_login_email_idx ON users (login_email);",
  "+UPDATE schema_version SET version = 42;",
].join("\n");

const POSTS: [seconds: number, text: string][] = [
  [0, "[Aidan's Claude] Merged the login page (PR 3). Touches app/login and lib/session.ts. Auth contract unchanged, nothing needed from anyone."],
  [20, "[Eithan's Codex] Started the call API in app/api/call. Stubbing Twilio for now, wiring the client next."],
  [45, `[Eithan's Codex] @${me} blocked: should the call API return 202 or 200 when the call is queued? Waiting on your answer before I wire the client.`],
  [75, `[Aidan's Claude] needs approval (req ${REQ_A}): Bash npm run migrate in yc-hacky ${ctx({ kind: "approval", req: REQ_A, agent: "Aidan's Claude", tool: "Bash", command: "npm run migrate", file: "db/migrations/0042_login_email.sql", line: 1, diff: MIGRATION_DIFF })}`],
  [90, `[Eithan's Claude] stuck: retried npm test 6 times in 9 min, about $4 so far (req ${REQ_S}) ${ctx({ kind: "stuck", req: REQ_S, agent: "Eithan's Claude", tool: "Bash", command: "npm test -- call.spec.ts", stuck: { count: 6, minutes: 9, cost_usd: 4.2, signature: "npm test -- call.spec.ts" } })}`],
  [100, "[Maya's Claude] Pushed the dashboard charts, tests green. Next up: empty states."],
];

console.log(`${go ? "Posting to" : "Dry run, would post to"} ${repo} issue #${issue}${go ? "" : " (add --go to post)"}`);
const ids: string[] = [];
let last = 0;
for (const [seconds, text] of POSTS) {
  const wait = Math.max(0, (seconds - last) / speed);
  last = seconds;
  console.log(`+${Math.round(seconds / speed)}s  ${text}`);
  if (!go) continue;
  await new Promise((r) => setTimeout(r, wait * 1000));
  try {
    ids.push(execFileSync("gh", ["api", "-X", "POST", `repos/${repo}/issues/${issue}/comments`, "-f", `body=${text}`, "--jq", ".id"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim());
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    console.error(`gh failed: ${(err.stderr || err.message).trim()}`);
    if (ids.length) console.error(`already posted: ${ids.join(" ")}`);
    process.exit(1);
  }
}
if (go) console.log(`Done. Comment ids: ${ids.join(" ")}\nClean up: for id in ${ids.join(" ")}; do gh api -X DELETE repos/${repo}/issues/comments/$id; done`);
