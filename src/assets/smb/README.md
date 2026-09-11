# NES Super Mario Bros. sprite sheets

## Phaser metatile atlas

`metatiles.png` holds individual original metatiles in six palette variants.
`metatiles.json` records every source URL, palette order, and covered tile IDs.
The sources are Rick N. Bruns's background-only maps at NESMaps. The converter
is `../../../scripts/extract-metatiles.mjs`; it uses the decoded disassembly
coordinates to collect native 16-pixel graphics, and retains the most common
sample for each tile. It does not infer geometry from the images. Identical
graphic IDs share frames, and missing palette variants reuse recolored frames.
Reference map images stay outside the build. Only the small tile atlas is used
for rendering. Original Nintendo graphics are retained; the archive is not a
license grant. See the generated source list for exact image URLs.

## World 1-1 map

`world-tiles.png` contains the unique 16×16 sprites extracted offline from the
original surface map. `../../game/world-tiles.ts` places the individual tiles.
The reference `world-1-1.png` is retained unchanged and is not imported or
bundled by the game. Map assembled by Rick N. Bruns / NESMaps (2008); game
graphics by Nintendo. The offline conversion script is `../../../scripts/extract-world-tiles.mjs`.

- https://nesmaps.com/maps/SuperMarioBrothers/SuperMarioBrosWorld1-1MapBG.html
- https://nesmaps.com/maps/SuperMarioBrothers/SuperMarioBrosMap1-1BG.png

Collision coordinates in `../../game/world-1-1.ts` were derived by matching the
map's 16×16 ground, brick, question-block, and stair tiles. Pipes use their
original positions and heights. Interactive blocks have separate sprites that
bounce, change to used blocks, or disappear on destruction. No sky patches or
full-map backdrop are used. The underground room is not playable in this
surface-level prototype.

## Character and prototype scenery sheets

Original Nintendo character pixels, replacing the prototype's drawn approximations.
Downloaded from Mario Universe's NES Super Mario Bros. sprite collection:

- https://www.mariouniverse.com/sprites-nes-smb/
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/mario.png
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/enemies.png
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/tiles-2.png

Nintendo owns these graphics. The hosting site is an archive, not a license grant.
The downloaded sheets are retained unchanged. Frame coordinates and horizontal
flips are in `../../game/smb-sprites.ts`. Source transparency and colors are
preserved for normal characters. Flower Goombas and Koopas replace their main
body or shell color with white while keeping their faces and outlines.
`scenery.png` is the archived `tiles-2.png` sheet and supplies the used-block
sprite. The item sprites are drawn in code using the NES palette. The finish is
the original castle door tile in the map.
There are no log sprites or log hiding places.

Walking and running use the same source frames; distance traveled controls frame
advance. Mario uses three movement frames plus idle, skid, jump, and his original
small-Mario death pose. Goombas and
Koopas use their original two-frame cycles. The player Goomba holds a source frame
while airborne because the original enemy has no separate jumping animation.
