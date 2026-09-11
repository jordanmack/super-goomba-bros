// Offline asset conversion. The game loads only the resulting atlas and grid.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const source = process.argv[2];
if (!source)
  throw new Error("Usage: node scripts/extract-world-tiles.mjs source.png");
const pixels = execFileSync(
  "convert",
  [source, "-crop", "3584x240+0+0", "-depth", "8", "rgba:-"],
  { maxBuffer: 4e6 },
);
const tiles = [],
  ids = new Map(),
  rows = [];
for (let row = 0; row < 15; row++) {
  const cells = [];
  for (let column = 0; column < 224; column++) {
    const tile = Buffer.alloc(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      const offset = ((row * 16 + y) * 3584 + column * 16) * 4;
      pixels.copy(tile, y * 64, offset, offset + 64);
    }
    const key = tile.toString("base64");
    if (!ids.has(key)) {
      ids.set(key, tiles.length);
      tiles.push(tile);
    }
    cells.push(ids.get(key));
  }
  rows.push(cells);
}
const width = 256,
  height = Math.ceil(tiles.length / 16) * 16;
const atlas = Buffer.alloc(width * height * 4);
tiles.forEach((tile, i) => {
  for (let y = 0; y < 16; y++)
    tile.copy(
      atlas,
      ((Math.floor(i / 16) * 16 + y) * width + (i % 16) * 16) * 4,
      y * 64,
      (y + 1) * 64,
    );
});
writeFileSync(
  "src/assets/smb/world-tiles.png",
  execFileSync(
    "convert",
    ["-size", `${width}x${height}`, "-depth", "8", "rgba:-", "png:-"],
    { input: atlas },
  ),
);
writeFileSync(
  "src/game/world-tiles.ts",
  `// Generated offline by scripts/extract-world-tiles.mjs. Tile 0 is empty sky.\nexport const TILE_COUNT = ${tiles.length};\nexport const WORLD_TILES: readonly (readonly number[])[] = [\n${rows.map((row) => "  [" + row.join(",") + "],").join("\n")}\n];\n`,
);
console.log(
  `${tiles.length} unique 16x16 tiles; ${rows.length} rows, 224 columns.`,
);
