import { areaData } from "./levels.ts";

// #214: the land rescue cast. The stage's own enemy rows weight the species.

export type LandSpecies =
  | "goomba"
  | "green-koopa"
  | "red-koopa"
  | "buzzy"
  | "hop-paratroopa"
  | "fly-paratroopa"
  | "red-paratroopa";

// SMB1 enemy IDs, in the order ties are broken.
export const LAND_SPECIES_TYPE: Record<LandSpecies, number> = {
  goomba: 0x06,
  "green-koopa": 0x00,
  "red-koopa": 0x03,
  buzzy: 0x02,
  "hop-paratroopa": 0x0e,
  "fly-paratroopa": 0x10,
  "red-paratroopa": 0x0f,
};
const ORDER = Object.keys(LAND_SPECIES_TYPE) as LandSpecies[];

// Rows of each species over the stage's route areas. The hard-mode bit is
// ignored: every row counts.
export function speciesRows(route: readonly string[]) {
  const rows = new Map<LandSpecies, number>();
  for (const id of route)
    for (const enemy of areaData(id).enemies) {
      const species = ORDER.find((s) => LAND_SPECIES_TYPE[s] === enemy.type);
      if (species) rows.set(species, (rows.get(species) ?? 0) + 1);
    }
  return rows;
}

// Today's mix: every third NPC, from the second, is a green Koopa.
function defaultCast(population: number): LandSpecies[] {
  return Array.from({ length: population }, (_, i) =>
    i % 3 === 1 ? "green-koopa" : "goomba",
  );
}

// Integer counts proportional to the rows, summing to the population, by
// largest remainder. Then each slot takes the species furthest behind its
// share so far, which spreads every species across the level.
export function landCast(
  route: readonly string[],
  population: number,
): LandSpecies[] {
  const rows = speciesRows(route);
  const present = ORDER.filter((s) => rows.has(s));
  if (present.every((s) => s === "goomba" || s === "green-koopa"))
    return defaultCast(population);
  const total = present.reduce((n, s) => n + rows.get(s)!, 0);
  const counts = new Map<LandSpecies, number>();
  const shares = present.map((s) => {
    const quota = (rows.get(s)! * population) / total;
    counts.set(s, Math.floor(quota));
    return { s, rest: quota - Math.floor(quota) };
  });
  let left = population - [...counts.values()].reduce((n, c) => n + c, 0);
  for (const { s } of [...shares].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    counts.set(s, counts.get(s)! + 1);
    left--;
  }
  const used = new Map<LandSpecies, number>();
  const cast: LandSpecies[] = [];
  for (let i = 0; i < population; i++) {
    let best: LandSpecies | undefined,
      behind = -Infinity;
    for (const s of present) {
      const lag = (counts.get(s)! * (i + 1)) / population - (used.get(s) ?? 0);
      if ((used.get(s) ?? 0) < counts.get(s)! && lag > behind + 1e-9) {
        best = s;
        behind = lag;
      }
    }
    cast.push(best!);
    used.set(best!, (used.get(best!) ?? 0) + 1);
  }
  return cast;
}
