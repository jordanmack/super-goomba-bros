import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIX,
  WARNING_CHIRPS,
  WAV_PEAK_TARGET,
  pickWarningChirp,
} from "../src/game/config.ts";

const audioDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/assets/audio",
);

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function wavLevels(bytes: Uint8Array) {
  if (
    bytes.length < 12 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== "WAVE"
  )
    throw new Error("not a WAVE file");
  let offset = 12;
  let channels = 1;
  let bits = 16;
  let data: Uint8Array | undefined;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = readU32(bytes, offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      channels = readU16(bytes, start + 2);
      bits = readU16(bytes, start + 14);
    } else if (id === "data") data = bytes.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!data) throw new Error("WAVE has no data chunk");
  const samples: number[] = [];
  if (bits === 8) {
    for (const value of data) samples.push((value - 128) / 128);
  } else if (bits === 16) {
    for (let i = 0; i + 1 < data.length; i += 2) {
      let value = data[i]! | (data[i + 1]! << 8);
      if (value & 0x8000) value -= 0x10000;
      samples.push(value / 32768);
    }
  } else throw new Error(`unsupported WAV bit depth ${bits}`);
  let peak = 0;
  let sumSq = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    sumSq += sample * sample;
  }
  return { channels, bits, peak, rms: Math.sqrt(sumSq / samples.length) };
}

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

test("bundled WAV cues share the documented peak target and do not clip", () => {
  const files = readdirSync(audioDir).filter((name) => name.endsWith(".wav"));
  assert.ok(files.includes("gameover.wav"));
  assert.ok(files.includes("world_clear.wav"));
  assert.ok(files.includes("stage_clear.wav"));
  assert.ok(files.includes("pipe.wav"));
  assert.ok(files.includes("fireworks.wav"));
  assert.ok(files.includes("bowserfire.wav"));
  assert.ok(files.includes("fireball.wav"));
  const levels = new Map<string, { peak: number; rms: number }>();
  for (const name of files) {
    const measured = wavLevels(readFileSync(join(audioDir, name)));
    levels.set(name, measured);
    assert.equal(measured.channels, 1, name);
    assert.ok(
      measured.peak <= 1,
      `${name} clips at peak ${measured.peak}`,
    );
    assert.ok(
      measured.peak >= WAV_PEAK_TARGET * 0.98,
      `${name} peak ${measured.peak} leaves unused headroom vs ${WAV_PEAK_TARGET}`,
    );
    assert.ok(
      Math.abs(measured.peak - WAV_PEAK_TARGET) < 0.02,
      `${name} peak ${measured.peak} off target ${WAV_PEAK_TARGET}`,
    );
  }
  const gameover = levels.get("gameover.wav")!;
  const worldClear = levels.get("world_clear.wav")!;
  const stageClear = levels.get("stage_clear.wav")!;
  const pipe = levels.get("pipe.wav")!;
  const coin = levels.get("coin.wav")!;
  assert.ok(
    Math.abs(gameover.peak - worldClear.peak) < 0.01,
    `gameover peak ${gameover.peak} vs world_clear ${worldClear.peak}`,
  );
  assert.ok(
    gameover.rms > worldClear.rms * 0.8 && gameover.rms < worldClear.rms * 1.5,
    `gameover rms ${gameover.rms} vs world_clear ${worldClear.rms}`,
  );
  assert.ok(stageClear.peak >= WAV_PEAK_TARGET * 0.98);
  assert.ok(pipe.peak >= WAV_PEAK_TARGET * 0.98);
  assert.ok(
    coin.rms < stageClear.rms,
    `short coin rms ${coin.rms} should sit under stage_clear ${stageClear.rms}`,
  );
});

test("Bowser flame cue is the Mayhem bowser-fire WAV, not fireball or fireworks", () => {
  const audioSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../src/game/audio.ts"),
    "utf8",
  );
  assert.match(audioSrc, /flame:\s*"bowserFire"/);
  assert.match(audioSrc, /fire:\s*"fireball"/);
  assert.match(audioSrc, /firework:\s*"fireworks"/);
  const flame = readFileSync(join(audioDir, "bowserfire.wav"));
  const fireball = readFileSync(join(audioDir, "fireball.wav"));
  const fireworks = readFileSync(join(audioDir, "fireworks.wav"));
  assert.ok(flame.length > 0);
  assert.notEqual(Buffer.compare(flame, fireball), 0);
  assert.notEqual(Buffer.compare(flame, fireworks), 0);
});

test("mix constants keep looping music under cues and tally quieter than a coin", () => {
  assert.equal(WAV_PEAK_TARGET, 10 ** (-1 / 20));
  assert.equal(MIX.managerVolume, 0.8);
  assert.equal(MIX.musicVolume, 0.55);
  assert.ok(MIX.musicVolume < 1);
  assert.ok(MIX.tallyVolume < 1);
  assert.ok(MIX.tallyVolume < MIX.managerVolume);
  assert.ok(MIX.tallyVolume <= 0.3);
});
