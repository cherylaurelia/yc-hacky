// Run: node --test lib/spoken.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { ciState } from "./spoken.ts";

test("ciState: failure beats pending beats success", () => {
  assert.equal(ciState(undefined, []), "none");
  assert.equal(ciState("success", [{ status: "completed", conclusion: "failure" }]), "failing");
  assert.equal(ciState("success", [{ status: "in_progress", conclusion: null }]), "still running");
  assert.equal(ciState(undefined, [{ status: "completed", conclusion: "success" }]), "passing");
});
