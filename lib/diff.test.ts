// Run: node --test lib/diff.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { diffRows } from "./diff.ts";

test("unified diff: headers are meta, hunks set the line numbers, +/- get their own side", () => {
  const rows = diffRows("diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -10,3 +10,4 @@ fn\n keep\n-old\n+new\n+more\n tail\n");
  assert.deepEqual(rows.map((r) => [r.kind, r.old, r.new, r.text]), [
    ["meta", undefined, undefined, "diff --git a/x.ts b/x.ts"],
    ["meta", undefined, undefined, "--- a/x.ts"],
    ["meta", undefined, undefined, "+++ b/x.ts"],
    ["hunk", undefined, undefined, "@@ -10,3 +10,4 @@ fn"],
    ["ctx", 10, 10, "keep"],
    ["del", 11, undefined, "old"],
    ["add", undefined, 11, "new"],
    ["add", undefined, 12, "more"],
    ["ctx", 12, 13, "tail"],
  ]);
});

test("a deleted line that looks like a header stays a deletion; bare +/- lines have no numbers", () => {
  assert.equal(diffRows("@@ -1,2 +1,1 @@\n--- sql comment\n ok")[1].kind, "del");
  assert.deepEqual(diffRows("-a\n+b").map((r) => [r.kind, r.old, r.new]), [["del", undefined, undefined], ["add", undefined, undefined]]);
});
