// Offline art extraction. Geometry comes only from the disassembly level JSON.
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

const referenceDir = process.argv[2];
if (!referenceDir)
  throw new Error(
    "Usage: node scripts/extract-metatiles.mjs <reference-directory> [--download]",
  );
const campaign = JSON.parse(
  readFileSync("src/assets/levels/campaign.json", "utf8"),
).levels;
const sources = {
  day: ["1-1", "1-3", "2-1", "2-3", "4-1", "4-3", "8-1", "8-2", "8-3"],
  night: ["3-3", "6-1", "6-2"],
  snow: ["6-3"],
  underground: ["1-2", "4-2"],
  water: ["2-2"],
  castle: ["1-4", "2-4", "3-4", "4-4", "7-4", "8-4"],
  "snow-day": ["5-1", "5-2", "7-1"],
  "snow-night": ["3-1", "3-2"],
};
const themes = Object.keys(sources);
const urls = [];
const frames = new Map();
const regions = [];
let groundPattern;
const signature = (pixels) => {
  const colors = new Map(),
    pattern = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const color = pixels.subarray(i, i + 3).toString("hex");
    if (!colors.has(color)) colors.set(color, colors.size);
    pattern.push(colors.get(color));
  }
  return pattern.join(",");
};
for (const [theme, levels] of Object.entries(sources)) {
  const samples = new Map();
  for (const id of levels) {
    const url = `https://nesmaps.com/maps/SuperMarioBrothers/SuperMarioBrosMap${id}BG.png`;
    const filename = join(referenceDir, `${id}.png`);
    urls.push(url);
    if (!existsSync(filename)) {
      if (!process.argv.includes("--download"))
        throw new Error(`Missing reference ${filename}`);
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Reference download ${url}: ${response.status}`);
      writeFileSync(filename, Buffer.from(await response.arrayBuffer()));
    }
    const main = campaign.find((level) => level.id === id).main;
    const area = JSON.parse(
      readFileSync(`src/assets/levels/area-${main}.json`, "utf8"),
    );
    const dimensions = execFileSync(
      "identify",
      ["-format", "%w %h", filename],
      { encoding: "utf8" },
    )
      .split(" ")
      .map(Number);
    const pixels = execFileSync(
      "convert",
      [filename, "-depth", "8", "rgba:-"],
      { maxBuffer: 32e6 },
    );
    const tileAt = (column, row, offsetY) => {
      const image = Buffer.alloc(1024);
      for (let y = 0; y < 16; y++) {
        const pos =
          ((offsetY + row * 16 + y) * dimensions[0] + column * 16) * 4;
        pixels.copy(image, y * 64, pos, pos + 64);
      }
      return image;
    };
    if (id === "1-1") groundPattern = signature(tileAt(0, 13, 0));
    // Archive images can place cloud bonus rooms above the main level. Locate
    // the main strip from known ground glyphs, independent of its palette.
    const anchors = area.tiles
      .flatMap((row, y) =>
        row.flatMap((tile, x) => (tile === 84 ? [[x, y]] : [])),
      )
      .slice(0, 64);
    let offsetY = theme === "water" ? 240 : 0;
    if (anchors.length) {
      let best = -1;
      for (
        let candidate = 0;
        candidate + 240 <= dimensions[1];
        candidate += 240
      ) {
        const matches = anchors.filter(
          ([x, y]) => signature(tileAt(x, y, candidate)) === groundPattern,
        ).length;
        if (matches > best) {
          best = matches;
          offsetY = candidate;
        }
      }
      if (best < Math.min(8, anchors.length))
        throw new Error(`Could not align ${id} with its ground anchors`);
    }
    regions.push({ level: id, area: main, offsetY });
    for (let y = 2; y < 15; y++)
      for (
        let x = 0;
        x < Math.min(area.width, Math.floor(dimensions[0] / 16));
        x++
      ) {
        const tile = area.tiles[y][x];
        if (!tile || tile === 95 || tile === 96) continue;
        const image = Buffer.alloc(1024);
        for (let row = 0; row < 16; row++) {
          const pos = ((offsetY + y * 16 + row) * dimensions[0] + x * 16) * 4;
          pixels.copy(image, row * 64, pos, pos + 64);
        }
        // Remove only the blue sky. Preserve all NES foreground colors.
        for (let p = 0; p < image.length; p += 4)
          if (image[p] === 92 && image[p + 1] === 148 && image[p + 2] === 252)
            image[p + 3] = 0;
        if (!samples.has(tile)) samples.set(tile, new Map());
        const key = image.toString("base64"),
          counts = samples.get(tile);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
  }
  for (const [id, counts] of samples) {
    const [key] = [...counts].sort((a, b) => b[1] - a[1])[0];
    frames.set(`${theme}:${id}`, Buffer.from(key, "base64"));
  }
}

// Cloud bonus terrain does not occur in a main-stage map. Use its original
// frame from the already credited sprite sheet rather than a blank substitute.
frames.set(
  "day:136",
  execFileSync("convert", [
    "src/assets/smb/scenery.png",
    "-crop",
    "16x16+64+336",
    "-depth",
    "8",
    "rgba:-",
  ]),
);

// Springs are sprites in SMB1. NESMaps BG maps therefore yield a blank 103 and
// a half-brick 104. Paint the rest-frame trampoline so the tiles are visible.
const springPixel = (rows) => {
  const image = Buffer.alloc(1024);
  const colors = {
    R: [181, 49, 32],
    G: [230, 156, 33],
    W: [252, 252, 252],
  };
  for (let y = 0; y < 16; y++) {
    const row = rows[y];
    for (let x = 0; x < 16; x++) {
      const rgb = colors[row[x]];
      if (!rgb) continue;
      const i = (y * 16 + x) * 4;
      image[i] = rgb[0];
      image[i + 1] = rgb[1];
      image[i + 2] = rgb[2];
      image[i + 3] = 255;
    }
  }
  return image;
};
const springTop = springPixel([
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
]);
const springBottom = springPixel([
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "WW...WW..WW...WW",
  "WW...WW..WW...WW",
  "WGGGGGW..WGGGGGW",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
]);
for (const theme of themes) {
  frames.set(`${theme}:103`, Buffer.from(springTop));
  frames.set(`${theme}:104`, Buffer.from(springBottom));
}

// Identical source metatile graphics have distinct IDs for their game behavior.
const aliases = {
  16: 18,
  17: 19,
  53: 81,
  85: 81,
  86: 81,
  87: 81,
  88: 81,
  89: 81,
  90: 82,
  91: 82,
  92: 82,
  93: 82,
  94: 82,
  193: 192,
  107: 28,
  108: 31,
};
const palette = {
  day: ["fcbcb0", "c84c0c"],
  night: ["fcbcb0", "c84c0c"],
  underground: ["5cfcfc", "008088"],
  snow: ["fcfcfc", "a4a4a4"],
  castle: ["fcfcfc", "a4a4a4"],
  water: ["b8f818", "00a800"],
  "snow-day": ["fcbcb0", "c84c0c"],
  "snow-night": ["fcbcb0", "c84c0c"],
};
const recolor = (image, from, to, id) => {
  const result = Buffer.from(image);
  if (id < 64 || id >= 128) return result;
  for (let p = 0; p < result.length; p += 4) {
    const hex = result.subarray(p, p + 3).toString("hex");
    const index = palette[from].indexOf(hex);
    if (index >= 0) Buffer.from(palette[to][index], "hex").copy(result, p);
  }
  return result;
};
const atlasHeight = themes.length * 256;
const atlas = Buffer.alloc(256 * atlasHeight * 4),
  coverage = {};
for (const [themeIndex, theme] of themes.entries()) {
  coverage[theme] = [];
  for (let id = 1; id < 198; id++) {
    if (id === 95 || id === 96) continue;
    const canonical = aliases[id] ?? id;
    let image =
      frames.get(`${theme}:${id}`) ?? frames.get(`${theme}:${canonical}`);
    if (!image)
      for (const fallback of themes) {
        const source = frames.get(`${fallback}:${canonical}`);
        if (source) {
          image = recolor(source, fallback, theme, id);
          break;
        }
      }
    if (!image) continue;
    coverage[theme].push(id);
    for (let row = 0; row < 16; row++)
      image.copy(
        atlas,
        ((themeIndex * 256 + Math.floor(id / 16) * 16 + row) * 256 +
          (id % 16) * 16) *
          4,
        row * 64,
        row * 64 + 64,
      );
  }
}
const missing = [];
for (const name of readdirSync("src/assets/levels").filter((n) =>
  /^area-.*\.json$/.test(n),
)) {
  const area = JSON.parse(
    readFileSync(`src/assets/levels/${name}`, "utf8"),
  );
  const covered = coverage[area.palette] ?? [];
  for (const id of new Set(area.tiles.flat())) {
    if (!id || id === 95 || id === 96) continue;
    if (!covered.includes(id)) missing.push(`${area.palette}:${id}`);
  }
}
if (missing.length)
  throw new Error(`Missing original tile art: ${[...new Set(missing)].join(", ")}`);
mkdirSync("src/assets/smb", { recursive: true });
writeFileSync(
  "src/assets/smb/metatiles.png",
  execFileSync(
    "convert",
    ["-size", `256x${atlasHeight}`, "-depth", "8", "rgba:-", "png:-"],
    { input: atlas },
  ),
);
writeFileSync(
  "src/assets/smb/metatiles.json",
  JSON.stringify({ themes, coverage, regions, sources: urls }, null, 2) + "\n",
);
console.log(
  `Extracted ${coverage.day.length} metatiles across ${themes.length} palettes. No map image is bundled.`,
);
