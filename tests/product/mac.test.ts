// Mac app product checks: behavior specs in Swift, the built bundle, and that each piece is wired in.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { MAC, ROOT, swiftSources, swiftSpec } from "./helpers.ts";

// ---------- behavior ----------

const SPECS: [name: string, title: string, deps: string[]][] = [
  ["insert", "dictation pastes into the focused app and restores the clipboard", ["Insert.swift"]],
  ["router", "one talk key: dictate by default, agents when they wait on you", ["Talk.swift"]],
  ["scribe", "speaks the ElevenLabs realtime Scribe protocol with a single-use token", ["Scribe.swift"]],
  ["appconfig", "a fresh install opens the hosted page, not localhost or one repo", ["AppConfig.swift"]],
  ["offline", "a failed page load shows why and a Retry", ["OfflinePage.swift"]],
  ["onboarding", "first-launch onboarding walks permissions, talk key and agents", ["Onboarding.swift"]],
  ["settings", "settings persist with sane defaults", ["Settings.swift", "Ptt.swift"]],
  ["loginitem", "launch at login reports the real state", ["LoginItem.swift"]],
  ["alertactions", "agent alert notifications have Allow, Deny, Stop and Reply buttons", ["AlertActions.swift"]],
  ["relay", "the local relay takes agent events and returns your answer within a second", ["Relay.swift", "Pill.swift"]],
];
for (const [name, title, deps] of SPECS) test(`mac: ${title}`, () => swiftSpec(name, deps));

test("mac: launch at login uses SMAppService", () => {
  const f = join(MAC, "LoginItem.swift");
  assert.ok(existsSync(f), "missing macos/Coworker/LoginItem.swift");
  assert.match(readFileSync(f, "utf8"), /SMAppService/);
});

test("mac: dictation streams audio to Scribe over a websocket", () => {
  const f = join(MAC, "Scribe.swift");
  assert.ok(existsSync(f), "missing macos/Coworker/Scribe.swift");
  const s = readFileSync(f, "utf8");
  assert.match(s, /class\s+ScribeClient\b/, "ScribeClient class");
  assert.match(s, /URLSessionWebSocketTask|webSocketTask/, "uses a websocket");
});

test("mac: a Settings window exists", () => {
  const all = [...swiftSources().values()].join("\n");
  assert.match(all, /class\s+SettingsWindow\b/, "class SettingsWindow");
});

test("mac: no dev-server URL in the app", () => {
  for (const [f, s] of swiftSources()) assert.doesNotMatch(s, /localhost:3000/, `${f} still points at localhost:3000`);
});

// ---------- wiring: each piece is used by the app, not only by its spec ----------

const WIRED: [type: string, file: string][] = [
  ["TextInserter", "Insert.swift"], ["TalkRouter", "Talk.swift"], ["ScribeClient", "Scribe.swift"],
  ["AppConfig", "AppConfig.swift"], ["OfflinePage", "OfflinePage.swift"], ["Onboarding", "Onboarding.swift"],
  ["AppSettings", "Settings.swift"], ["LoginItem", "LoginItem.swift"], ["AlertActions", "AlertActions.swift"],
  ["RelayServer", "Relay.swift"], ["SettingsWindow", ""],
];
for (const [type, file] of WIRED) {
  test(`mac: ${type} is wired into the app`, () => {
    const src = swiftSources();
    const home = file || [...src].find(([, s]) => new RegExp(`class\\s+${type}\\b`).test(s))?.[0];
    assert.ok(home && src.has(home), `${type} is not defined`);
    const users = [...src].filter(([f, s]) => f !== home && !f.startsWith("Probe") && new RegExp(`\\b${type}\\b`).test(s)).map(([f]) => f);
    assert.ok(users.length > 0, `${type} is defined in ${home} but nothing else in macos/Coworker uses it`);
  });
}

// ---------- the built app (tests/product/run.sh runs macos/build.sh first) ----------

const APP = join(ROOT, "macos/build/Coworker.app");
const plist = (key: string) => {
  try {
    return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(APP, "Contents/Info.plist")], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const built = () => {
  assert.equal(process.env.PRODUCT_BUILD_STATUS, "0", `macos/build.sh failed: ${process.env.PRODUCT_BUILD_LOG ?? "(run tests/product/run.sh)"}`);
};

test("mac build: the app has an icon", () => {
  built();
  const icon = plist("CFBundleIconFile");
  assert.ok(icon, "Info.plist has no CFBundleIconFile");
  const res = join(APP, "Contents/Resources");
  const file = [icon, `${icon}.icns`].map((n) => join(res, n)).find(existsSync);
  assert.ok(file, `Resources has no ${icon}(.icns)`);
  assert.equal(readFileSync(file).subarray(0, 4).toString("latin1"), "icns", "not an icns file");
});

test("mac build: the version comes from macos/VERSION and the menu shows it", () => {
  built();
  const vf = join(ROOT, "macos/VERSION");
  assert.ok(existsSync(vf), "missing macos/VERSION");
  const v = readFileSync(vf, "utf8").trim();
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.equal(plist("CFBundleShortVersionString"), v);
  assert.match([...swiftSources().values()].join("\n"), /CFBundleShortVersionString/, "nothing in the app reads its version");
});

test("mac build: a DMG installer is built", () => {
  built();
  const dmg = join(ROOT, "macos/build/Coworker.dmg");
  assert.ok(existsSync(dmg), "no macos/build/Coworker.dmg");
  assert.ok(statSync(dmg).mtimeMs / 1000 >= Number(process.env.PRODUCT_RUN_START ?? 0) - 1, "the DMG is stale, not from this build");
  execFileSync("hdiutil", ["imageinfo", dmg], { stdio: "ignore" });
});

test("mac build: the bundle includes the coworker CLI for agents", () => {
  built();
  const cli = join(APP, "Contents/Resources/bin/coworker");
  assert.ok(existsSync(cli), "Coworker.app/Contents/Resources/bin/coworker is missing");
  assert.ok(statSync(cli).mode & 0o111, "not executable");
  assert.ok(readdirSync(join(APP, "Contents/Resources/bin")).includes("coworker"));
  const hook = join(APP, "Contents/Resources/hooks/coworker-hook.sh");
  assert.ok(existsSync(hook) && statSync(hook).mode & 0o111, "the board fallback hook ships next to the CLI (Resources/hooks/coworker-hook.sh)");
});

test("mac: only the configured Coworker page can answer agents", () => {
  const s = swiftSources().get("CoworkerPanel.swift") ?? "";
  assert.match(s, /frameInfo\.(isMainFrame|securityOrigin)/, "the answer handler checks which frame and origin sent the message");
});
