# SMB1 level tables

The original level and enemy tables come from doppelganger's annotated public
SMB disassembly, mirrored by Will Sams:

- https://gist.github.com/WillSams/678a2d8a49d3f01e1d6e0362f83d1fbc
- https://gist.githubusercontent.com/WillSams/678a2d8a49d3f01e1d6e0362f83d1fbc/raw/1202d0a4a1feaded9b1f1947d5aade7d91cca0e1/SMBDIS.ASM

Nintendo owns the original game data. The public archive is not a license grant.
No ROM or CHR binary is read, downloaded, or required. Only selected numeric
text tables and pointer labels are retained in `source-tables.json`, with the
original source URL and SHA-256. The converter does not execute assembly.

Run `ionice -c3 nice -n19 node scripts/extract-levels.mjs` from the project root
to reproduce the JSON offline. Use `--refresh` to fetch the pinned text source,
or supply a local `.asm` text reference. No network is used by the game.

## Format

`campaign.json` lists all 32 stages in order. `route` preserves pipe intro areas
before their main underground/water area. Shared layouts remain shared data.
Each `area-XX.json` has a normalized hexadecimal area pointer as its ID:

- `tiles`: 15 screen rows of original 16-pixel metatile IDs, including two empty
  HUD rows. IDs index the disassembly's four metatile palettes. Zero is empty.
- `header`, `attributes`: entrance, terrain, scenery, style, and palette changes.
- `objects`: decoded source commands, with byte offsets for auditing.
- `blocks`: brick/question positions, original contents, and hidden flags.
  Game rules may randomize the released powers.
- `enemies`: source enemy IDs, positions, and hard-mode flags. Group and moving
  platform commands are retained as IDs. Enemy Y uses absolute screen rows.
- `destinations`: world-specific three-byte area-pointer commands. These latch
  before pipe entry; they are not individual enemy spawns.
- `pipes`: dimensions, entry direction, and latched destinations per world.
  `null` direction marks an arrival mouth, not a decoration. The shared intro
  uses the campaign route for its destination. Warp-zone pipes override the
  shared area-pointer latch with `WarpZoneNumbers` (1-2: worlds 4/3/2; 4-2
  underground column 214: world 5; 4-2 vine bonus `2f` columns 50/54/58:
  worlds 8/7/6). Extra mouths with no world stay inert. Vine commands remain
  in `objects`.
- `goal`: castle door, final castle room, or an exit pipe to another area.
  Bonus cloud/warp areas can have no direct goal.

The converter follows the source's terrain masks, scenery tables, object
dimensions, and metatile drawing rules. It keeps space beyond the last object
for camera movement. It omits the original invisible castle stop block so the
player can enter the door in this rescue game. Castle-room rescue doors are a
custom endpoint after the original bridge, not a flag finish. In area 42, the
pipe coin rooms, it fills the empty cells on rows 2-12 between each room's exit
lip and the next room's left wall with wall brick (tile 82), so a wide view
does not show that void.

`tests/levels.test.ts` compares World 1-1 pipes, gaps, stairs, floating blocks,
and castle coordinates with the previous map; it also checks all generated
areas, campaign order, and known pipe routes. These data checks do not certify
that characters can traverse every level. Campaign tests and the recorded
player-input replays cover navigation separately.
