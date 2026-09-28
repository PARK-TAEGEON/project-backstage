import test from "node:test";
import assert from "node:assert/strict";
import { games } from "../src/games";
import { getStartBlocker, nextPhase } from "../src/lib/game/engine";
import { generateStructured } from "../src/lib/ai/generate";
import { createMockProvider } from "../src/lib/ai/mock";
import { directorEventSchema } from "../src/lib/ai/schemas";
import type { Player } from "../src/lib/game/types";

const players = (count: number): Player[] => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, roomId: "room", nickname: `친구${i}`, isReady: true }));

for (const game of Object.values(games)) {
  test(`${game.id}: only 4–8 unique, ready players can start`, () => {
    assert.notEqual(getStartBlocker(players(3), game), null);
    assert.equal(getStartBlocker(players(4), game), null);
    assert.equal(getStartBlocker(players(8), game), null);
    assert.notEqual(getStartBlocker(players(9), game), null);
    const unready = players(4); unready[0].isReady = false;
    assert.notEqual(getStartBlocker(unready, game), null);
    const duplicate = players(4); duplicate[1].id = duplicate[0].id;
    assert.notEqual(getStartBlocker(duplicate, game), null);
  });
  test(`${game.id}: guessing precedes reveal and results terminate the round`, () => {
    assert.equal(nextPhase(game, "playing"), "guessing");
    assert.equal(nextPhase(game, "guessing"), "reveal");
    assert.equal(nextPhase(game, "reveal"), "results");
    assert.equal(nextPhase(game, "results"), null);
  });
}

const request = { role: "director" as const, systemPrompt: "test", input: {}, schema: directorEventSchema };
test("AI boundary accepts valid structured data", async () => {
  assert.deepEqual(await generateStructured(createMockProvider({ text: "주제를 바꿔볼까요?" }), request), { text: "주제를 바꿔볼까요?" });
});
test("AI boundary rejects malformed data and unrequested fields", async () => {
  await assert.rejects(generateStructured(createMockProvider({ text: 42 }), request));
  await assert.rejects(generateStructured(createMockProvider({ text: "hi", secret: "unexpected" }), request));
});
test("an aborted request never reaches the provider", async () => {
  let called = false;
  const provider = { name: "spy", async generateJSON() { called = true; return { text: "hi" }; } };
  await assert.rejects(generateStructured(provider, { ...request, signal: AbortSignal.abort() }));
  assert.equal(called, false);
});
