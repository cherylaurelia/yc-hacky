// Run: node --test lib/repo.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseRepo } from "./repo.ts";

test("owner/name passes through", () => {
  assert.deepEqual(parseRepo("cherylaurelia/yc-hacky"), { ok: true, repo: "cherylaurelia/yc-hacky" });
});

test("a github.com URL gives owner/name", () => {
  assert.deepEqual(parseRepo("https://github.com/cherylaurelia/yc-hacky"), { ok: true, repo: "cherylaurelia/yc-hacky" });
});

test("a URL with .git and a trailing slash gives owner/name", () => {
  assert.deepEqual(parseRepo("https://github.com/cherylaurelia/yc-hacky.git/"), { ok: true, repo: "cherylaurelia/yc-hacky" });
});

test("invalid input is rejected", () => {
  for (const bad of [undefined, 42, "", "   ", "justaname", "https://gitlab.com/a/b", "-bad/name", "owner/.."]) {
    assert.equal(parseRepo(bad).ok, false, String(bad));
  }
});
