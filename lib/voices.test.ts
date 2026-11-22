// Run: node --test lib/voices.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { COWORKER_VOICE, COWORKER_VOICES, POSTER_VOICES, coworkerVoice } from "./voices.ts";

test("Coworker's choices start with its current voice and never overlap an agent's", () => {
  assert.equal(COWORKER_VOICES[0], COWORKER_VOICE);
  const ids = COWORKER_VOICES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of POSTER_VOICES) assert.ok(!ids.includes(p.id), `${p.name} belongs to the agents`);
});

test("only an offered voice id is accepted", () => {
  assert.equal(coworkerVoice(COWORKER_VOICES[2].id), COWORKER_VOICES[2]);
  assert.equal(coworkerVoice("CwhRBWXzGAHq8TQ4Fs17"), undefined);
  assert.equal(coworkerVoice(null), undefined);
});
