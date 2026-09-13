# Original SMB1 graphics

Nintendo owns the original graphics. These public archives are sources, not
license grants. The game is an unofficial fan prototype.

## Tiles

`metatiles.png` is the runtime tile atlas. `metatiles.json` records source URLs,
palette order, frame coverage, and the selected image strips. The converter is
[extract-metatiles.mjs](../../../scripts/extract-metatiles.mjs).

Graphics come from Rick N. Bruns's NESMaps background maps. The converter uses
decoded disassembly coordinates, then identifies the correct image strip from
known ground tiles. Some archive images place bonus rooms above the main map.
Only individual tiles are extracted. No whole-map image is imported by the game.

The atlas includes normal, night, snow, underground, water, and castle variants.
Identical graphic IDs share frames. Missing palette variants use recolored
frames. The cloud bonus terrain uses its original frame from `scenery.png`,
the archived `tiles-2.png` sheet. That sheet is used only during offline extraction.

The original World 1-1 collision and pixel references now live under
[tests/fixtures](../../../tests/fixtures/README.md). They are not runtime assets.

- https://nesmaps.com/maps/SuperMarioBrothers/SuperMarioBrosWorld1-1MapBG.html
- https://nesmaps.com/maps/SuperMarioBrothers/SuperMarioBrosMap1-1BG.png

Every additional map-image URL is recorded in `metatiles.json`.

## Characters and items

The unchanged source sheets come from Mario Universe:

- https://www.mariouniverse.com/sprites-nes-smb/
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/mario.png
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/enemies.png
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/items-objects.png
- https://www.mariouniverse.com/wp-content/img/sprites/nes/smb/tiles-2.png

Frame crops are in [smb-sprites.ts](../../game/smb-sprites.ts). Walking and running
use original movement frames, with animation speed tied to movement speed.
Mario also has idle, skid, jump, and death poses. Goombas and Koopas use their
two-frame cycles. Koopa shells use the original closed and legs-out frames, at
the Koopa's current mushroom scale. Fire Goombas and Koopas use a white power-up
palette while retaining their original faces and outlines.

Items, coins, platforms, fireballs, and flagpole flags also use original sprite
frames. The Goomba flag recolors the original Mario flag.
Small fireballs use the native eight-pixel fireball image. Castle doors use
original metatiles. No log graphics or hiding places are included.
