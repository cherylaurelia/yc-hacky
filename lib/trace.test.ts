// Run: node --test lib/trace.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { audited, outcomeOf } from "./trace.ts";

test("without TRACEROOT_API_KEY it only runs the function", async () => {
  delete process.env.TRACEROOT_API_KEY;
  assert.equal(await audited("tool.x", { repo: "a/b" }, async (a) => (a.set({ input: { n: 1 } }), 7)), 7);
  await assert.rejects(
    audited("tool.x", {}, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
});

test("status codes map to an outcome", () => {
  assert.deepEqual([200, 400, 403, 404, 429, 502].map(outcomeOf), ["ok", "invalid", "blocked", "invalid", "rate_limited", "error"]);
});

test("with a key, a call becomes a coworker.* span sent to the host with a Bearer key", async () => {
  const seen: { path?: string; auth?: string; body: string }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      seen.push({ path: req.url, auth: req.headers.authorization, body: (req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw).toString("latin1") });
      res.writeHead(200, { "content-type": "application/x-protobuf" }).end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  process.env.TRACEROOT_API_KEY = "test-key";
  process.env.TRACEROOT_HOST_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const res = await audited("tool.answer_request", { tool: "answer_request", decision: "deny", request_id: "ab12cd" }, async (a) => {
      a.set({ input: { request_id: "ab12cd", decision: "deny" } });
      return Response.json({ result: "Sent deny for request ab12cd." });
    });
    assert.equal(res.status, 200);
    await audited("tool.nope", {}, async () => Response.json({ error: "I don't have a tool called nope." }, { status: 404 }));
  } finally {
    await new Promise((ok) => server.close(ok));
  }
  assert.ok(seen.length >= 1, "the host got a POST");
  assert.equal(seen[0].path, "/api/v1/public/traces");
  assert.equal(seen[0].auth, "Bearer test-key");
  const all = seen.map((s) => s.body).join("");
  for (const want of ["coworker.tool.answer_request", "ab12cd", "deny", "outcome", "Sent deny for request ab12cd.", "coworker.tool.nope", "invalid"]) assert.ok(all.includes(want), `span data has ${want}`);
});
