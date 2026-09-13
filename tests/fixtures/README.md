# Regression reference data

`world-1-1.ts`, `world-tiles.ts`, and `world-1-1-tiles.png` preserve the previous
World 1-1 collision and pixel references. They verify the new text decoder and
tile renderer against the playable baseline. Their NESMaps source is credited
in `src/assets/smb/README.md`.

`player-routes.json` records ordinary input runs that reach each stage's castle
door. Each pair is `[buttons, frames]`, with bit1 Left, bit2 Right, bit4 Jump,
bit8 Pipe, and bit16 Run. These files are never included in the game build.

The player replay tests disable Mario, pre-satisfy the rescue quota, and remove
emerging power-ups. This isolates movement and proves that no random power-up
is required. The campaign tests check NPC navigation and rescue quotas. Other
simulation tests cover active Mario, warnings, powers, death, and a complete win.

To find replacement routes after a deliberate physics or layout change, run
`ionice -c3 nice -n19 node --experimental-strip-types tests/support/find-player-routes.ts`.
Supply stage IDs to limit the search. Results go to the named debug JSON in
`/tmp`; inspect and replay them before replacing this fixture. Search limits
are not proof that a route is impossible.
