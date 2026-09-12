# Super Goomba Bros: migration to Phaser 4 and full SMB1 level import

## Context

Read `README.md` and `docs/game-spec.md` first. The current dependency versions
are in `package.json`. The existing game uses a Three.js renderer, Matter.js
physics, React screens, and custom touch input. The one hand-typed level is
`src/game/world-1-1.ts`. Assets are pre-extracted NES sprites and recordings in
`src/assets/`, with credits in the README files there.

The playable baseline is committed as `7bd6efe`; the paths in this context
describe that baseline. Current code and validation are documented in README
and the game spec. The original World 1-1 references are now test fixtures.
This plan was approved for
implementation; the user requested a handoff and local commits before migration.
Use sequential progression through the levels unless the user directs otherwise.

## Goals

1. Replace Three.js, Matter.js, and the custom renderer and input code
   with Phaser 4 (Arcade physics, tilemaps, sprite animations, camera,
   audio, pointer input).
2. Load all 32 original Super Mario Bros. levels from bundled JSON data.
3. Keep the custom game rules: NPC warnings, rescues to the castle door,
   Mario as AI hunter, power-ups, blood effects, and the rescue quota.
4. Keep the single-file production build (`dist/index.html`).

## Hard constraints

- Never require or read a ROM file. Only use pre-extracted data from
  public game-data sites or the public SMB disassembly text tables.
  Record every source URL in the relevant `src/assets/*/README.md`.
- Keep the headless rule logic testable in Node without a browser.
- Keep `src/game/config.ts` as the single source of tuning values.
- Run every build, lint, and test with `ionice -c3 nice -n19` prefix.
- Check for a dev server on port 5173 before starting one.
- Treat compiler and lint warnings as blockers.
- Make small logical commits with imperative messages.

## Plan

### Phase 0: baseline

- Commit the current untracked work.
- Confirm `bun run test`, `bun run lint`, `bun run build`, and
  `bun run test:browser` pass. Record results.

### Phase 1: level data pipeline (no engine change yet)

- Write `scripts/extract-levels.mjs` that parses the SMB1 area object and
  enemy tables from the public disassembly text into one JSON file per
  area under `src/assets/levels/`. Include: tile grid, pipes and their
  destinations, question and brick blocks with contents, enemy spawns,
  area type (overworld, underground, water, castle), and palette.
- Write a Node test that decodes World 1-1 and matches the existing
  `world-1-1.ts` data (gaps, pipes, bricks, question blocks, castle door).
- Document the source URLs and format in `src/assets/levels/README.md`.

### Phase 2: introduce Phaser 4

- Add `phaser` as a dependency. Keep React for title, pause, and result
  screens, and the HUD. Mount Phaser in a container under the React app.
- Create `src/game/scenes/` with a Boot scene (asset loading) and a Play
  scene. Build a Phaser tilemap from the level JSON with collision flags.
- Port sprite frame tables from `src/game/smb-sprites.ts` into Phaser
  spritesheet and animation definitions.
- Port audio cue mapping from `src/game/audio.ts` to the Phaser sound
  manager, keeping the loop offsets.

### Phase 3: port gameplay onto Arcade physics

- Player: fixed walk speed, fixed jump height, no run. Small and giant
  forms. Fireballs with flower. Imported stages need more horizontal jump
  reach, so the working implementation adds air speed while preserving the
  existing walking pace and normal jump-height cap.
- NPCs: traits, warning by contact, fleeing to the castle door, item
  pickup by contact, off-camera progress.
- Mario AI: patrol right, sight and chase, crowd attraction, backtrack
  and return, strength stages, death and revival.
- Blocks: bounce, break, question block items, used blocks.
- Effects: speech bubbles, blood pixels and stains.
- Pull rule logic into pure functions or a headless model that the
  Phaser scene drives, so `tests/simulation.test.ts` still runs in Node.

### Phase 4: input

- Replace custom touch handling with Phaser pointer input. Keep the
  spec rules: each pointer tracked separately, slide between buttons,
  release on slide out, clear all holds on pause, blur, hide, or rotate.
- Keyboard: Left/Right or A/D, Space/Up/W jump, Z fire, Escape pause.

### Phase 5: multiple levels

- Sequential progression through all 32 levels.
- Pipes as entrances using the destination data.
- Underground, water, and castle tile sets and music. Add the assets
  from the same public archives already credited.

### Phase 6: cleanup and verification

- Remove Three.js, Matter.js, the old renderer, and scripts that no
  longer apply. Update `README.md` and `docs/game-spec.md`.
- Update Playwright checks in `tests/browser/game.spec.ts`.
- Run all checks and the production build. Test on a phone browser,
  including iOS Safari, and report results plainly.

## Definition of done

- All acceptance checks in `docs/game-spec.md` pass.
- All 32 levels load and are traversable by NPCs and the player.
- Lint, unit tests, browser tests, and the single-file build pass.
- No ROM, no runtime network fetch of assets, all sources credited.

## Reporting

After each phase, checkpoint: what is done, what is verified with
command output, and what is left. Fail loud on anything skipped.
