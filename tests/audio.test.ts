import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WARNING_CHIRPS,
  pickWarningChirp,
} from "../src/game/config.ts";

test("warning chirps are a random pool of short squeaks", () => {
  assert.ok(WARNING_CHIRPS.length >= 4);
  const shapes = WARNING_CHIRPS.map(
    (chirp) =>
      `${chirp.startHz}:${chirp.peakHz}:${chirp.endHz}:${chirp.peakAt}:${chirp.endAt}`,
  );
  assert.equal(new Set(shapes).size, WARNING_CHIRPS.length);
  for (const chirp of WARNING_CHIRPS) {
    assert.ok(chirp.startHz > 0);
    assert.ok(chirp.peakHz > 0);
    assert.ok(chirp.endHz > 0);
    assert.ok(chirp.stopAt >= 0.15 && chirp.stopAt <= 0.3);
  }
  const picks = [0, 0.25, 0.5, 0.75, 0.99].map((n) =>
    pickWarningChirp(() => n),
  );
  const heard = new Set(
    picks.map((chirp) => `${chirp.startHz}:${chirp.peakHz}:${chirp.endHz}`),
  );
  assert.ok(heard.size > 1);
});
