// The Mac app starts, lists and stops agents for the page.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const ROOT = resolve(import.meta.dirname, "../..");
const MAC = join(ROOT, "macos/Coworker");
const run = promisify(execFile);
const src = (f: string) => (existsSync(join(MAC, f)) ? readFileSync(join(MAC, f), "utf8") : "");

test("mac: AgentRunner builds a safe login-shell command for coworker run", async () => {
  assert.ok(existsSync(join(MAC, "AgentRunner.swift")), "missing macos/Coworker/AgentRunner.swift");
  const out = join(mkdtempSync(join(tmpdir(), "cw-ar-")), "spec");
  await run("swiftc", ["-parse-as-library", "-swift-version", "5", "-wmo", join(MAC, "AgentRunner.swift"), join(ROOT, "tests/actions/mac/agentrunner.swift"), "-o", out], { timeout: 240_000 });
  await run(out, [], { timeout: 30_000 }).catch((e) => { throw new Error(String(e.stdout ?? e)); });
});

test("mac: the page can await the app (start, list, stop agents)", () => {
  const panel = src("CoworkerPanel.swift");
  assert.match(panel, /WKScriptMessageHandlerWithReply/, "the panel answers page messages with a reply");
  assert.match(panel, /"coworkerAsync"/, "registered as messageHandlers.coworkerAsync");
  const all = ["AppDelegate.swift", "CoworkerPanel.swift"].map(src).join("\n");
  assert.match(all, /AgentRunner\.(arguments|start)/, "the app uses AgentRunner");
  assert.match(all, /"runs"|\["runs"\]|runs\b/, "lists runs");
  assert.match(all, /"stop"/, "stops runs");
});
