import * as THREE from "three";
import { characterSprites, scenerySprites } from "./smb-sprites";

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

export function makeArt() {
  const characters = characterSprites();
  const assets = {
    ...characters,
    ...scenerySprites(),
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
  const textures: Record<string, THREE.CanvasTexture> = Object.fromEntries(
    Object.entries(assets).map(([name, canvas]) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      return [name, texture];
    }),
  );
  return { textures, portrait: characters.goomba.toDataURL() };
}
