import { characterSprites, scenerySprites } from "./smb-sprites";
import type { SpriteSources } from "./smb-sprites";

function pixels(rows: string[], palette: Record<string, string>) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const context = canvas.getContext("2d")!;
  rows.forEach((row, y) =>
    [...row].forEach((color, x) => {
      if (palette[color]) {
        context.fillStyle = palette[color];
        context.fillRect(x, y, 1, 1);
      }
    }),
  );
  return canvas;
}

export function makeArt(sources: SpriteSources) {
  const characters = characterSprites(sources);
  const assets = {
    ...characters,
    ...scenerySprites(sources),
    star: pixels(
      [
        ".......KK.......",
        "......KYYK......",
        "......KYYK......",
        ".....KYYYYK.....",
        ".KKKKYYYYYYKKKK.",
        ".KYYYYYYYYYYYYK.",
        "..KYYKY YKYYYK..".replace(" ", "Y"),
        "...K YKYYKYYK...".replace(" ", "Y"),
        "...KYYYYYYYYK...",
        "..KYYYYYYYYYYK..",
        "..KYYYYYYYYYYK..",
        ".KYYYYK..KYYYYK.",
        ".KYYKK....KKYYK.",
        ".KKK........KKK.",
      ],
      { K: "#000000", Y: "#fcb800" },
    ),
    mushroom: pixels(
      [
        ".....RRRRRR.....",
        "...RRRRWWRRRR...",
        "..RRRRWWWWRRRR..",
        ".RRRRRRWWRRRRRR.",
        ".RWWRRRRRRRRWWR.",
        "RRWWWRRRRRRWWWRR",
        "RRWWRRRRRRRRWWRR",
        "RRRRRRRWWRRRRRRR",
        "RRRRRRWWWWRRRRRR",
        ".RRRRRWWWWRRRRR.",
        "..KKWWWWWWWWKK..",
        "...KWWWWWWWWK...",
        "...KWWWWWWWWK...",
        "...KWWWWWWWWK...",
        "....KWWWWWWK....",
        ".....KKKKKK.....",
      ],
      { R: "#d82800", W: "#fcbcb0", K: "#000000" },
    ),
    flower: pixels(
      [
        "....OOOOOOOO....",
        "..OOYYYYYYYYOO..",
        ".OYYWWWWWWWWYYO.",
        ".OYWKKWWWWKKWYO.",
        ".OYYWWWWWWWWYYO.",
        "..OOYYYYYYYYOO..",
        "....OOOOOOOO....",
        ".......GG.......",
        "..GG...GG...GG..",
        "..GGG..GG..GGG..",
        "...GGG.GG.GGG...",
        "....GGGGGGGG....",
        ".....GGGGGG.....",
        ".......GG.......",
        ".......GG.......",
        "......GGGG......",
      ],
      { O: "#d82800", Y: "#fcb800", W: "#ffffff", K: "#000000", G: "#80d010" },
    ),
  };
  return { assets, portrait: characters.goomba.toDataURL() };
}
