// End-to-end flows for the Coworker page, driven in a real Chromium.
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/flows.ts   (prints "failed=N" last)
// Needs a dev server (E2E_BASE, default http://localhost:3600) started with SESSION_SECRET,
// ELEVENLABS_API_KEY, GITHUB_TOKEN, WRITE_REPOS and DEMO_REPOS set for the repo below, and `gh` logged in.
// Board writes go to issue #4 only, and every post this run creates is deleted before it exits.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { type Browser, type BrowserContext, type Page, chromium } from "playwright";
import { seal } from "../lib/session.ts";

const BASE = process.env.E2E_BASE ?? "http://localhost:3600";
const REPO = "cherylaurelia/yc-hacky";
const BOARD = 4;
const PAGE = `${BASE}/?repo=${REPO}&board=${BOARD}`;
const SECRET = process.env.SESSION_SECRET ?? "";

// ---------- helpers ----------

const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" }).trim();
function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Comment = { id: number; body: string };
const boardComments = (): Comment[] =>
  gh("api", `repos/${REPO}/issues/${BOARD}/comments?per_page=100`, "--jq", ".[] | {id, body}")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Comment);

const baseline = Math.max(0, ...boardComments().map((c) => c.id));
const created: number[] = [];
const postBoard = (body: string): number => {
  const id = Number(gh("api", `repos/${REPO}/issues/${BOARD}/comments`, "-f", `body=${body}`, "--jq", ".id"));
  created.push(id);
  return id;
};
// Delete what this run posted, plus the "req <id> allow|deny|stop" answers the page posted for our request ids.
const reqIds: string[] = [];
function teardown() {
  const mine = boardComments().filter((c) => c.id > baseline && (created.includes(c.id) || reqIds.some((r) => new RegExp(`req ${r}\\b`).test(c.body))));
  for (const c of mine) {
    try {
      gh("api", "-X", "DELETE", `repos/${REPO}/issues/comments/${c.id}`);
    } catch (e) {
      console.log(`teardown: could not delete comment ${c.id}: ${(e as Error).message}`);
    }
  }
  console.log(`teardown: deleted ${mine.length} test post(s)`);
}

const ctxBlock = (o: object) => `<!-- coworker:${JSON.stringify(o).replace(/@/g, "\\u0040").replace(/</g, "\\u003c").replace(/>/g, "\\u003e")} -->`;
const DIFF = "--- a/app/api/demo.ts\n+++ b/app/api/demo.ts\n@@ -1,3 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n const c = 4;\n";
const hookApproval = (id: string, command = "") =>
  `[E2E's Claude] needs approval (req ${id}): ${command ? `Bash ${command}` : "Edit demo.ts"} in yc-hacky\n\n${ctxBlock({ v: 1, kind: "approval", req: id, session: "e2e00001", agent: "E2E's Claude", repo: "yc-hacky", cwd: "/tmp/e2e", tool: command ? "Bash" : "Edit", command, file: command ? null : "app/api/demo.ts", line: command ? null : 2, diff: command ? null : DIFF, stuck: null })}`;
const hookStuck = (id: string) =>
  `[E2E's Claude] stuck: retried npm test 3 times in 5 min, about $1 (req ${id})\n\n${ctxBlock({ v: 1, kind: "stuck", req: id, session: "e2e00002", agent: "E2E's Claude", repo: "yc-hacky", cwd: "/tmp/e2e", tool: "Bash", command: "npm test", file: null, line: null, diff: null, stuck: { count: 3, minutes: 5, cost_usd: 1.2, signature: "npm test" } })}`;

let browser: Browser;
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  return errors;
};
const newCtx = (opts: Parameters<Browser["newContext"]>[0] = {}) => browser.newContext({ baseURL: BASE, permissions: ["microphone"], ...opts });

async function signedInCtx(opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  must(SECRET.length >= 32, "SESSION_SECRET (32+ chars) must be set to build a session cookie.");
  const me = JSON.parse(gh("api", "user")) as { login: string; name: string | null; avatar_url: string };
  const value = await seal({ token: gh("auth", "token"), login: me.login, name: me.name, avatar: me.avatar_url }, SECRET);
  const ctx = await newCtx(opts);
  await ctx.addCookies([{ name: "coworker_session", value, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

type Box = { s: string; x: number; y: number; w: number; h: number };
async function layoutProblems(page: Page, sels: string[], pairs: [string, string][]): Promise<string[]> {
  const { boxes, vw, vh, sw } = await page.evaluate((sels) => {
    const boxes = sels.map((s) => {
      const el = document.querySelector(s);
      if (!el) return { s, x: 0, y: 0, w: 0, h: 0 };
      const r = el.getBoundingClientRect();
      return { s, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return { boxes, vw: window.innerWidth, vh: window.innerHeight, sw: document.documentElement.scrollWidth };
  }, sels);
  const by = new Map<string, Box>(boxes.map((b) => [b.s, b]));
  const out: string[] = [];
  for (const b of boxes) {
    if (b.w === 0 || b.h === 0) out.push(`${b.s} is missing or empty`);
    else if (b.x < -0.5 || b.x + b.w > vw + 0.5) out.push(`${b.s} sticks out sideways (${Math.round(b.x)}..${Math.round(b.x + b.w)} of ${vw})`);
  }
  if (sw > vw + 1) out.push(`page scrolls sideways (${sw} > ${vw})`);
  for (const [a, b] of pairs) {
    const p = by.get(a)!;
    const q = by.get(b)!;
    const ix = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
    const iy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
    if (ix > 1 && iy > 1) out.push(`${a} overlaps ${b}`);
  }
  const pill = by.get("button[data-phase]");
  if (pill && pill.y + pill.h > vh + 1) out.push(`pill is below the fold (${Math.round(pill.y + pill.h)} > ${vh})`);
  return out;
}

const results: { name: string; ok: boolean }[] = [];
async function flow(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name} (${Math.round((Date.now() - t0) / 1000)}s): ${(e as Error).message.split("\n")[0]}`);
  }
}
const VISIBLE = { state: "visible" as const, timeout: 10_000 };

// ---------- flows ----------

async function calmPage() {
  const sizes: { w: number; h: number; q: string }[] = [
    { w: 1440, h: 900, q: "" },
    { w: 390, h: 844, q: "" },
    { w: 360, h: 520, q: "&embed=1" },
  ];
  for (const { w, h, q } of sizes) {
    const ctx = await newCtx({ viewport: { width: w, height: h } });
    try {
      const page = await ctx.newPage();
      const errors = watchErrors(page);
      await page.goto(`${PAGE}${q}`);
      await page.locator("h1").waitFor(VISIBLE);
      await page.locator("button[data-phase]").waitFor(VISIBLE);
      await page.waitForTimeout(1500);
      const label = `${w}x${h}${q}`;
      must(errors.length === 0, `console errors at ${label}: ${errors.join(" | ")}`);
      const sels = ["header", "h1", "footer", "button[data-phase]"];
      const pairs: [string, string][] = [["header", "h1"], ["h1", "footer"], ["header", "footer"], ["h1", "button[data-phase]"]];
      if (!q) {
        sels.push("header [data-repo-chip]", "header [data-account]");
        pairs.push(["header [data-repo-chip]", "header [data-account]"]);
      }
      must(!/cherylaurelia\/yc-hacky/i.test(await page.locator("header").innerText()), `the raw owner/name is still shown in the header at ${label}`);
      const extras = await page.getByRole("button", { name: /^(standup|change repo|end session)$/i }).count();
      must(extras === 0, `${extras} extra control(s) under the pill (Standup, Change repo or End session)`);
      const problems = await layoutProblems(page, sels, pairs);
      must(problems.length === 0, `layout at ${label}: ${problems.join("; ")}`);
    } finally {
      await ctx.close();
    }
  }
}

async function signedOutLogin() {
  const ctx = await newCtx();
  try {
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    const hit: { url?: URL } = {};
    const authorize = "https://github.com/login/oauth/authorize";
    page.on("request", (r) => {
      if (r.url().startsWith(authorize)) hit.url = new URL(r.url());
    });
    await page.route("https://github.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>GitHub (stubbed)</h1>" }));
    await page.goto(PAGE);
    const btn = page.getByRole("button", { name: "Sign in with GitHub" });
    await btn.waitFor(VISIBLE);
    const message = page.getByRole("alert").filter({ hasText: /isn.t set up|not set up/i }).first();
    await btn.click();
    await Promise.race([page.waitForRequest((r) => r.url().startsWith(authorize), { timeout: 15_000 }).catch(() => null), message.waitFor({ state: "visible", timeout: 15_000 }).catch(() => null)]);
    if (hit.url) {
      const u = hit.url;
      must(u.pathname === "/login/oauth/authorize", `unexpected GitHub path ${u.pathname}`);
      must(!!u.searchParams.get("client_id"), "authorize URL has no client_id");
      must(u.searchParams.get("state")?.length, "authorize URL has no state");
      const redirect = u.searchParams.get("redirect_uri");
      must(!redirect || redirect === `${BASE}/api/auth/callback`, `redirect_uri is ${redirect}`);
      const state = (await ctx.cookies()).find((c) => c.name === "coworker_oauth");
      must(state?.value.startsWith(`${u.searchParams.get("state")}.`), "state cookie does not match the state sent to GitHub");
    } else {
      await page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/api/"), { timeout: 10_000 });
      await message.waitFor(VISIBLE);
      const body = (await page.locator("body").innerText()).trim();
      must(body.length > 20 && !body.startsWith("{"), "sign-in landed on a blank or raw page");
      // The type-a-repo path must still work.
      await page.locator("header [data-repo-chip]").click();
      await page.getByRole("dialog").getByRole("combobox").waitFor(VISIBLE);
    }
    must(errors.length === 0, `console errors: ${errors.join(" | ")}`);
  } finally {
    await ctx.close();
  }
}

async function signedInPicker() {
  const ctx = await signedInCtx();
  try {
    const page = await ctx.newPage();
    await page.goto(PAGE);
    const me = JSON.parse(gh("api", "user")) as { login: string };
    await page.locator("header img").first().waitFor({ state: "attached", timeout: 10_000 });
    await page.locator("header [data-account]").getByText(me.login, { exact: true }).waitFor(VISIBLE);

    const api = (await (await ctx.request.get("/api/repos")).json()) as { repos: { name: string; private: boolean }[] };
    must(api.repos.length > 5, "/api/repos returned too few repos");

    const chip = page.locator("header [data-repo-chip]");
    must((await chip.innerText()).trim() === REPO.split("/")[1], `the chip should show just the repo name, it shows "${await chip.innerText()}"`);
    await chip.click(); // one click opens the picker
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: /choose a repository/i }).waitFor(VISIBLE);
    const options = dialog.getByRole("option");
    await options.first().waitFor(VISIBLE);
    const shown = await options.evaluateAll((els) => els.map((e) => e.getAttribute("data-repo")));
    for (const r of api.repos.slice(0, 5)) must(shown.includes(r.name), `${r.name} missing from the picker (shown: ${shown.slice(0, 5).join(", ")}...)`);
    must(shown[0] === REPO, `the current repo should head the list, ${shown[0]} does`);
    const priv = api.repos.find((r) => r.private);
    if (priv) must(/private/i.test(await dialog.locator(`[role=option][data-repo='${priv.name}']`).innerText()), `no private badge on ${priv.name}`);
    must((await options.first().boundingBox())!.height >= 40, "rows are too short to tap");

    const search = dialog.getByRole("combobox");
    must(await search.evaluate((el) => el === document.activeElement), "the search field is not focused when the picker opens");
    await search.fill("build");
    await page.waitForFunction(() => {
      const o = [...document.querySelectorAll("dialog [role=option]")];
      return o.length >= 2 && o.every((e) => (e.getAttribute("data-repo") ?? "").toLowerCase().includes("build"));
    }, null, { timeout: 5_000 });
    await search.press("ArrowDown");
    const want = await dialog.locator("[role=option][aria-selected=true]").first().getAttribute("data-repo");
    must(want && want !== REPO, `no highlighted option after ArrowDown (got ${want})`);
    await search.press("Enter");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });

    await page.waitForFunction((r) => new URLSearchParams(location.search).get("repo") === r, want, { timeout: 5_000 });
    must(new URLSearchParams(page.url().split("?")[1]).get("board") === String(BOARD), "the ?board= param was dropped");
    must((await page.evaluate(() => localStorage.getItem("coworker.repo"))) === want, "repo was not remembered in localStorage");
    must((await chip.innerText()).trim() === want.split("/")[1], "the chip did not switch to the new repo");

    // Esc and the close button both dismiss it.
    await chip.click();
    await dialog.waitFor(VISIBLE);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
    await chip.click();
    await dialog.getByRole("button", { name: /close/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });

    // Recent first: a fresh visit with no ?repo= opens on the remembered repo, which heads the list.
    await page.goto(`${BASE}/?board=${BOARD}`);
    await page.locator("header [data-repo-chip]").filter({ hasText: want.split("/")[1] }).waitFor(VISIBLE);
    await page.locator("header [data-repo-chip]").click();
    await page.getByRole("dialog").getByRole("option").first().waitFor(VISIBLE);
    must((await page.getByRole("dialog").getByRole("option").first().getAttribute("data-repo")) === want, "the repo used last is not first in the picker");
  } finally {
    await ctx.close();
  }
}

async function signOut() {
  const ctx = await signedInCtx();
  try {
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(PAGE);
    const out = page.getByRole("button", { name: "Sign out" });
    await out.waitFor(VISIBLE);
    let navigations = 0;
    page.on("framenavigated", (f) => f === page.mainFrame() && navigations++);
    const logout = page.waitForResponse((r) => r.url().endsWith("/api/auth/logout"));
    await out.click();
    must((await logout).status() === 204, "logout did not answer 204");
    await page.getByRole("button", { name: "Sign in with GitHub" }).waitFor(VISIBLE);
    must((await page.getByRole("button", { name: "Sign out" }).count()) === 0, "Sign out is still showing");
    const cookie = (await ctx.cookies()).find((c) => c.name === "coworker_session" && c.value);
    must(!cookie, "session cookie is still set");
    must(navigations === 0, `the page reloaded ${navigations} time(s)`);
    const me = (await (await ctx.request.get("/api/me")).json()) as { user: unknown };
    must(me.user === null, "/api/me still sees a user");
    must(errors.length === 0, `console errors: ${errors.join(" | ")}`);
  } finally {
    await ctx.close();
  }
}

async function changeRepoSignedOut() {
  const ctx = await newCtx();
  try {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?board=${BOARD}`);
    const chip = page.locator("header [data-repo-chip]");
    must(/choose a repo/i.test(await chip.innerText()), `with no repo the chip should say "Choose a repo", it says "${await chip.innerText()}"`);
    // The question on the page itself takes owner/name too.
    const inline = page.locator("main").getByRole("combobox");
    await inline.waitFor(VISIBLE);
    await inline.fill("not a repo");
    await page.getByText(/is not a GitHub repo/i).first().waitFor(VISIBLE);
    await inline.press("Enter");
    must(new URL(page.url()).searchParams.get("repo") === null, "an invalid repo switched the page");
    await inline.fill(REPO);
    await inline.press("Enter");
    await chip.filter({ hasText: REPO.split("/")[1] }).waitFor(VISIBLE);

    // The chip opens the same picker; a GitHub link works there.
    await chip.click();
    const dialog = page.getByRole("dialog");
    const input = dialog.getByRole("combobox");
    await input.waitFor(VISIBLE);
    await input.fill("https://github.com/octocat/Hello-World");
    await input.press("Enter");
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
    await chip.filter({ hasText: "Hello-World" }).waitFor(VISIBLE);
    await page.waitForFunction(() => new URLSearchParams(location.search).get("repo") === "octocat/Hello-World", null, { timeout: 5_000 });
    must((await page.evaluate(() => localStorage.getItem("coworker.repo"))) === "octocat/Hello-World", "repo was not remembered");
    must((await chip.getAttribute("title")) === "octocat/Hello-World", "the owner should be in the chip's tooltip");
  } finally {
    await ctx.close();
  }
}

async function alertCard() {
  const ids = [randomBytes(3).toString("hex"), randomBytes(3).toString("hex"), randomBytes(3).toString("hex")];
  reqIds.push(...ids);
  const ctx = await newCtx();
  try {
    const page = await ctx.newPage();
    const first = page.waitForResponse((r) => r.url().includes("/api/board/new"));
    await page.goto(PAGE);
    await first; // the first poll only sets the baseline, so post after it
    postBoard(hookApproval(ids[0]));
    postBoard(hookApproval(ids[1]));
    postBoard(hookStuck(ids[2]));

    const card = page.locator("article[data-alert]");
    const answered = (id: string, word: string) => boardComments().some((c) => c.id > baseline && new RegExp(`req ${id}\\s+${word}\\b`, "i").test(c.body));
    const waitPosted = async (id: string, word: string) => {
      for (let i = 0; i < 20 && !answered(id, word); i++) await page.waitForTimeout(500);
      must(answered(id, word), `no "req ${id} ${word}" on the board`);
    };

    await card.waitFor({ state: "visible", timeout: 30_000 });
    const text = await card.innerText();
    must(/demo\.ts/.test(text), "card does not name the file");
    must(!/open in editor|stop agent/i.test(text), "the approval card shows more than Allow, Deny and Show me");
    await card.getByRole("button", { name: "Show me the change" }).click();
    const diff = card.locator("[data-diff]");
    await diff.waitFor(VISIBLE);
    const colors = await page.evaluate(() => {
      const bg = (k: string) => getComputedStyle(document.querySelector(`[data-diff] [data-row=${k}]`)!).backgroundColor;
      return { add: bg("add"), del: bg("del") };
    });
    must(colors.add !== colors.del && colors.add !== "rgba(0, 0, 0, 0)" && colors.del !== "rgba(0, 0, 0, 0)", `diff is not colored (${JSON.stringify(colors)})`);
    await card.getByRole("button", { name: "Allow", exact: true }).click();
    await waitPosted(ids[0], "allow");

    await page.locator(`article[data-alert]`).getByRole("button", { name: "Deny", exact: true }).waitFor(VISIBLE);
    await page.locator(`article[data-alert]`).getByRole("button", { name: "Deny", exact: true }).click();
    await waitPosted(ids[1], "deny");

    const stop = page.locator("article[data-alert]").getByRole("button", { name: /^Stop/ }).first();
    await stop.waitFor(VISIBLE);
    must(!/\$\d|min ·/.test(await page.locator("article[data-alert]").innerText()), "the stuck card shows cost or time stats");
    await stop.click();
    await waitPosted(ids[2], "stop");
  } finally {
    await ctx.close();
  }
}

async function standup() {
  const ctx = await newCtx();
  try {
    const page = await ctx.newPage();
    await page.goto(PAGE);
    await page.locator("button[data-phase]").waitFor(VISIBLE);
    must((await page.getByRole("button", { name: /standup/i }).count()) === 0, "the page still has a Standup button");
    const r = await ctx.request.get(`/api/standup?repo=${REPO}&board=${BOARD}&hours=3`, { timeout: 70_000 });
    if (r.status() === 200) {
      must((r.headers()["content-type"] ?? "").includes("audio/mpeg"), `standup content-type is ${r.headers()["content-type"]}`);
      must((await r.body()).length > 1000, "standup audio is empty");
      must(!!r.headers()["x-standup-script"], "standup came without its script");
    } else {
      must(r.status() === 404, `standup answered HTTP ${r.status()}`);
      const j = (await r.json()) as { error?: string };
      must(/quiet/i.test(j.error ?? ""), `standup error is not friendly: ${j.error}`);
    }
  } finally {
    await ctx.close();
  }
}

async function voiceSession() {
  const ctx = await newCtx();
  try {
    const page = await ctx.newPage();
    await page.goto(PAGE);
    const pill = page.locator("button[data-phase]");
    await pill.waitFor(VISIBLE);
    // ElevenLabs answers 429 while its concurrent-session cap is full (other people share it), so ask again a few times.
    let status = 0;
    for (let attempt = 0; attempt < 4 && status !== 200; attempt++) {
      if (attempt) await page.waitForTimeout(10_000);
      const token = page.waitForResponse((r) => r.url().includes("/api/convai-token"), { timeout: 15_000 });
      await page.keyboard.down("Space");
      status = (await token).status();
      if (status !== 200) await page.keyboard.up("Space");
    }
    must(status === 200, `/api/convai-token answered ${status}, not 200`);
    try {
      await page.waitForFunction(() => document.querySelector("button[data-phase]")?.getAttribute("data-phase") === "listening", null, { timeout: 25_000 });
    } catch {
      const alert = await page.getByRole("alert").first().innerText().catch(() => "");
      throw new Error(`never reached listening${alert ? `: ${alert}` : ""}`);
    }
    await page.keyboard.up("Space");
    await page.waitForFunction(() => {
      const el = document.querySelector("button[data-phase]");
      return el?.getAttribute("data-mic") === "muted" && el.getAttribute("data-phase") !== "listening";
    }, null, { timeout: 5_000 });
  } finally {
    await ctx.close();
  }
}

async function typeInstead() {
  const ctx = await newCtx({ permissions: [] });
  try {
    await ctx.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    });
    const page = await ctx.newPage();
    await page.goto(PAGE);
    await page.locator("button[data-phase]").waitFor(VISIBLE);
    await page.keyboard.down("Space");
    await page.keyboard.up("Space");
    await page.getByRole("button", { name: "Type instead" }).click();
    const box = page.getByRole("textbox", { name: "Message" });
    await box.waitFor({ state: "visible", timeout: 25_000 });
    await box.fill("hi");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // Messages carry a screen-reader tag, "You: " or "Coworker: ". A reply is a Coworker message after ours.
    const replied = () =>
      page.evaluate(() => {
        const tags = [...document.querySelectorAll("span.sr-only")].filter((e) => /^(You|Coworker): $/.test(e.textContent ?? ""));
        const mine = tags.findIndex((e) => e.textContent === "You: " && /hi$/.test(e.parentElement?.textContent ?? ""));
        return mine >= 0 && tags.slice(mine + 1).some((e) => e.textContent === "Coworker: ");
      });
    for (let i = 0; i < 30 && !(await replied()); i++) await page.waitForTimeout(500);
    must(await replied(), "no agent reply within 15 s");
  } finally {
    await ctx.close();
  }
}

async function notifications() {
  const [a, b] = [randomBytes(3).toString("hex"), randomBytes(3).toString("hex")];
  reqIds.push(a, b);
  const ctx = await newCtx({ permissions: ["notifications"] });
  try {
    // A Notification that records what the page does with it, and a page that reports itself hidden.
    await ctx.addInitScript(() => {
      class FakeNotification {
        static permission = "default";
        static requestPermission() {
          w.__asked++;
          FakeNotification.permission = "granted";
          return Promise.resolve("granted");
        }
        title: string;
        options: NotificationOptions;
        closed = false;
        onclick: (() => void) | null = null;
        constructor(title: string, options: NotificationOptions = {}) {
          this.title = title;
          this.options = options;
          w.__notes.push(this);
        }
        close() {
          this.closed = true;
        }
      }
      const w = window as unknown as { __asked: number; __notes: FakeNotification[] };
      w.__asked = 0;
      w.__notes = [];
      Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true, writable: true });
      Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
      document.hasFocus = () => false;
    });
    const page = await ctx.newPage();
    const seen = () =>
      page.evaluate(() => {
        const w = window as unknown as { __asked: number; __notes: { title: string; options: NotificationOptions; closed: boolean }[] };
        return { asked: w.__asked, notes: w.__notes.map((n) => ({ title: n.title, body: n.options.body, tag: n.options.tag, requireInteraction: n.options.requireInteraction, closed: n.closed })) };
      });

    const first = page.waitForResponse((r) => r.url().includes("/api/board/new"));
    await page.goto(PAGE);
    await first;
    postBoard(hookApproval(a));
    const card = page.locator("article[data-alert]");
    await card.waitFor({ state: "visible", timeout: 30_000 });

    // Before any click the browser would block audio, so the card says what to do. No permission yet, so no notification.
    const hint = card.getByText("Click anywhere to hear your agents");
    await hint.waitFor(VISIBLE);
    must((await seen()).notes.length === 0, "a notification was shown before the user had interacted");

    // The first click asks for notification permission, once.
    await page.mouse.click(20, 400);
    await hint.waitFor({ state: "hidden", timeout: 5_000 });
    await page.mouse.click(30, 420);
    must((await seen()).asked === 1, `notification permission was asked ${(await seen()).asked} time(s), not once`);

    // An alert arriving while the tab is hidden gets one notification.
    postBoard(hookApproval(b, "npm run migrate"));
    // Other agents post to this board too, so only our two request ids count.
    const ours = async (id: string) => (await seen()).notes.filter((x) => x.tag === id);
    let notes = await ours(b);
    for (let i = 0; i < 70 && notes.length === 0; i++) {
      await page.waitForTimeout(500);
      notes = await ours(b);
    }
    must(notes.length === 1, `expected 1 notification for the new alert, got ${notes.length}`);
    must((await ours(a)).length === 0, "the alert that arrived before permission was granted got a notification");
    const n = notes[0];
    must(n.title === "E2E's Claude needs you", `notification title is "${n.title}"`);
    must(n.body === "Wants to run npm run migrate", `notification body is "${n.body}"`);
    must(n.tag === b && n.requireInteraction === true, `notification tag/requireInteraction are ${n.tag}/${n.requireInteraction}`);
    await page.waitForResponse((r) => r.url().includes("/api/board/new"), { timeout: 20_000 });
    must((await ours(b)).length === 1, "the next poll notified again for the same alert");

    // Clicking it opens that alert's card, behind the one already open.
    await page.evaluate((tag) => {
      const w = window as unknown as { __notes: { options: NotificationOptions; onclick: (() => void) | null }[] };
      w.__notes.find((x) => x.options.tag === tag)?.onclick?.();
    }, b);
    await card.getByText("npm run migrate").first().waitFor(VISIBLE);

    // Answering closes it.
    await card.getByRole("button", { name: "Allow", exact: true }).click();
    for (let i = 0; i < 20 && !(await ours(b))[0].closed; i++) await page.waitForTimeout(250);
    must((await ours(b))[0].closed, "the notification stayed open after the request was answered");
  } finally {
    await ctx.close();
  }
}

// ---------- run ----------

browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
try {
  await flow("1 calm page, three viewports", calmPage);
  await flow("2 signed out: sign in", signedOutLogin);
  await flow("3 signed in: repo picker", signedInPicker);
  await flow("4 sign out", signOut);
  await flow("5 change repo signed out", changeRepoSignedOut);
  await flow("6 alert card: show, allow, deny, stop", alertCard);
  await flow("7 standup", standup);
  await flow("8 voice session", voiceSession);
  await flow("9 type instead", typeInstead);
  await flow("10 desktop notifications", notifications);
} finally {
  await browser.close();
  teardown();
}
console.log(`failed=${results.filter((r) => !r.ok).length}`);
