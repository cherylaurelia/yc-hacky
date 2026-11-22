// Retakes the four launch screens from the REAL app (production build on :3800, see serve.sh).
//
//   node video/scripts/capture.mjs            (run from the repo root; uses the app's own `playwright`)
//
// It loads the page first (alerts only show for posts that arrive after load), then posts copies of
// the real demo posts from issue #4 with fresh req ids, screenshots each state, and deletes every
// comment it created, even when a step fails. It never clicks Allow, Deny or Stop.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "screens");
const REPO = "cherylaurelia/yc-hacky";
const BOARD = 4;
const URL = `http://localhost:3800/?repo=${REPO}&board=${BOARD}`;
const created = [];

const gh = async (...args) => (await run("gh", args, { maxBuffer: 10_000_000 })).stdout;

// A real post from fixtures/, with a fresh request id. Optionally adds fields to its context block.
async function realPost(name, extra) {
  const raw = await readFile(join(here, "fixtures", `${name}-post.md`), "utf8");
  const oldReq = raw.match(/\(req ([0-9a-f]{6})\)/)?.[1];
  if (!oldReq) throw new Error(`${name}: no req id in the fixture`);
  const req = randomBytes(3).toString("hex");
  let body = raw.replaceAll(oldReq, req);
  if (extra) {
    body = body.replace(/<!-- coworker:(\{.*\}) -->/, (_, json) => `<!-- coworker:${JSON.stringify({ ...JSON.parse(json), ...extra })} -->`);
  }
  return body;
}

async function post(body) {
  const id = JSON.parse(await gh("api", `repos/${REPO}/issues/${BOARD}/comments`, "-f", `body=${body}`)).id;
  created.push(id);
  console.log("posted", id);
  return id;
}

// Someone else's `demo/reset.sh` deletes any post on the board that names a demo repo, ours included.
// A 404 therefore means the post is already gone, which is the state we want.
async function remove(id) {
  try {
    await gh("api", "-X", "DELETE", `repos/${REPO}/issues/comments/${id}`);
    console.log("deleted", id);
  } catch (e) {
    if (!/HTTP 404/.test(String(e.stderr ?? e.message))) throw e;
    console.log("already gone", id);
  }
  created.splice(created.indexOf(id), 1);
}

// Load the page and wait for its first board poll: that poll sets the baseline, and only posts made after it become alerts.
async function load(page) {
  const baseline = page.waitForResponse((r) => r.url().includes("/api/board/new") && r.ok());
  await page.goto(URL);
  await baseline;
  await page.getByRole("heading", { name: "Your agents are working." }).waitFor();
}

const shot = async (page, file) => {
  await page.waitForTimeout(900); // let the card-rise / diff-open animations finish
  await page.screenshot({ path: join(OUT, file) });
  console.log("saved", file);
};

// One state: load the page, post, wait for its card, run `take`, delete the post. The board is shared, so if
// someone else's post lands in the same window ("N more waiting" under the card), delete ours and try again.
async function clean(kind, page, makeBody, take) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await load(page);
    const id = await post(await makeBody());
    try {
      await page.locator(`article[data-kind="${kind}"]`).waitFor({ timeout: 45_000 });
      if (await page.getByText(/more waiting/).count()) {
        console.log(`${kind}: another post is on the board, retrying`);
        continue;
      }
      return await take();
    } finally {
      await remove(id);
    }
  }
  throw new Error(`${kind}: the board was never quiet enough for a clean screen`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const diff = await readFile(join(here, "fixtures", "schema.diff"), "utf8");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();

    // 1. calm
    await load(page);
    await shot(page, "01-calm.png");

    // 2 and 3. approval, then the diff. The real post has no diff, so it gets the real `git diff` of
    // the schema change the same demo run made (see fixtures/schema.diff).
    await clean("approval", page, () => realPost("approval", { file: "db/schema.sql", diff }), async () => {
      await shot(page, "02-approval.png");
      await page.getByRole("button", { name: "Show me the change" }).click();
      await page.locator("[data-diff]").waitFor();
      await shot(page, "03-diff.png");
    });

    // 4. stuck, on a fresh page load so the card is not queued behind the approval.
    await clean("stuck", page, () => realPost("stuck"), () => shot(page, "04-stuck.png"));
  } finally {
    await browser.close();
    for (const id of [...created]) await remove(id).catch((e) => console.error("COULD NOT DELETE", id, e.message));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
