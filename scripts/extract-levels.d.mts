export const SOURCE_URL: string;

export type ExtractedObject = {
  column: number;
  row: number;
  opcode: number;
  data: number;
  byte: number;
  offset: number;
};

export type ExtractedEnemy = {
  column: number;
  row: number;
  type: number;
  hard: boolean;
};

export type ExtractedDestination = {
  column: number;
  area: string;
  page: number;
  world: number;
  entrance: number;
};

export type ExtractedPipe = {
  column: number;
  row: number;
  width: number;
  height: number;
  direction: "down" | "right" | null;
  destinations: Array<{
    world: number;
    area: string;
    page: number;
    entrance: number;
  }>;
};

export type ExtractedBlock = {
  column: number;
  row: number;
  kind: string;
  hidden: boolean;
  content: string | null;
};

export type ExtractedArea = {
  id: string;
  label: string;
  type: string;
  palette: string;
  width: number;
  height: number;
  tileSize: number;
  header: {
    foreground: number;
    color: number;
    entrance: number;
    timer: number;
    terrain: number;
    background: number;
    style: number;
    cloud: boolean;
  };
  tiles: number[][];
  blocks: ExtractedBlock[];
  pipes: ExtractedPipe[];
  enemies: ExtractedEnemy[];
  destinations: ExtractedDestination[];
  attributes: Array<{ column: number; color?: number }>;
  objects: ExtractedObject[];
  goal: { kind: string; column: number; row: number } | null;
};

export type ExtractedLevel = {
  id: string;
  world: number;
  stage: number;
  route: string[];
  main: string;
};

export type TableSet = Record<string, (number | string)[]>;

export function parseTables(source: string): TableSet;
export function decodeObjects(bytes: number[]): ExtractedObject[];
export function decodeEnemies(bytes: number[]): {
  enemies: ExtractedEnemy[];
  destinations: ExtractedDestination[];
};
export function decodeArea(tables: TableSet, pointer: number): ExtractedArea;
export function decodeAll(tables: TableSet): {
  areas: ExtractedArea[];
  levels: ExtractedLevel[];
};
export function isSolidMetatile(id: number): boolean;
export function axeMetatileRow(tiles: number[][], column: number): number;
