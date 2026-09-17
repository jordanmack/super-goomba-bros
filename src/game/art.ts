import { characterSprites, scenerySprites } from "./smb-sprites";
import type { SpriteSources } from "./smb-sprites";

export function makeArt(sources: SpriteSources) {
  const characters = characterSprites(sources);
  return {
    assets: { ...characters, ...scenerySprites(sources, characters.goomba) },
    portrait: characters.goomba.toDataURL(),
  };
}
