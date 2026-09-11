# Super Goomba Bros

A single-level pixel-art browser game. Three.js renders the world; Matter.js
handles platform collisions. React provides the game screens and touch controls.
The level uses the original NES World 1-1 surface layout, with the game's custom
NPC rescues and Mario hunting. Reach the castle door after enough NPCs are saved.
Individual tiles build the level, with random power-ups
in question blocks: stars, giant mushrooms, and fire flowers.
NES character sprites and original music and effects are bundled locally. Character
sources and frame details are in [the sprite credits](src/assets/smb/README.md).
Recording sources and cue mappings are in [the audio credits](src/assets/audio/README.md).

## Run

```sh
bun install
ionice -c3 nice -n19 bun run dev --host 0.0.0.0
```

## Checks and build

```sh
ionice -c3 nice -n19 bun run test
ionice -c3 nice -n19 bun run lint
ionice -c3 nice -n19 bun run build
ionice -c3 nice -n19 bun run test:browser
```

Browser checks need Playwright Chromium installed (`bunx playwright install chromium`).
The production build is a self-contained `dist/index.html`, which can open directly
in a browser. The development server is only needed for development.

## Controls

| Action | Keyboard                                  |
| ------ | ----------------------------------------- |
| Walk   | Left / Right or A / D                     |
| Jump   | Space, Up, or W                           |
| Fire   | Z, after collecting a flower              |
| Pause  | Escape                                    |

The on-screen controls track each finger separately. Slide between buttons to
change actions, or slide outside to release. Native touch handlers block browser
gestures on the control area. Pause and interruptions clear all held input.
Real iPhone testing is needed to verify Safari's system magnifier behavior.
There is no hiding action. Pipes must be jumped over. All
floating blocks are solid. Small-player head hits bounce bricks; giant-player
hits break them without killing NPCs above. Mario can also break bricks.
Question blocks release one item and become used blocks. Mario
actively hunts the crowd; his kills produce pixel blood and temporary stains.
Stars and giant-player stomps kill Mario with his death tune and hop-and-fall
animation, followed by a quick return. Fireballs step Mario from fire to big to
small, then defeat him. Mushrooms grow characters to 3× size; flowers turn them
white. The player moves at one walking speed, with no Run control or Shift boost.
Touching an unwarned NPC automatically speaks an urgent warning and plays a
squeaky cue. NPCs
collect items by contact while continuing their escape. There is no heartbeat
or distance meter. If too many NPCs die, the goal stays locked and hunting continues.

See [the game spec](docs/game-spec.md) for the rules. Gameplay tuning is in
[src/game/config.ts](src/game/config.ts). No progress is stored between attempts.

This is an unofficial fan prototype, not affiliated with Nintendo. Character
names belong to their respective owners.
