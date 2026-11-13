import type { PeopleCode, PeopleGroup, TileFamily, TopologyConfig } from './types.ts';

export const PEOPLES: { code: PeopleCode; idx: number; label: string; group: PeopleGroup }[] = [
  { code: 'M', idx: 0, label: 'Mammifères', group: 'ANIMAL' },
  { code: 'R', idx: 1, label: 'Reptiles', group: 'ANIMAL' },
  { code: 'O', idx: 2, label: 'Oiseaux', group: 'ANIMAL' },
  { code: 'H', idx: 3, label: 'Humains', group: 'ONIRIQUE' },
  { code: 'E', idx: 4, label: 'Entités Magiques', group: 'ONIRIQUE' },
  { code: 'I', idx: 5, label: 'Insectes', group: 'SYMBIOTIQUE' },
];

export const PEOPLE_INDEX: Record<PeopleCode, number> = {
  M: 0,
  R: 1,
  O: 2,
  H: 3,
  E: 4,
  I: 5,
};

export interface TileMeta {
  numericId: number; // 1..30
  code: string; // G1..G15, R1..R10, M1..M5
  family: TileFamily;
  rowPeople: PeopleCode;
  colPeople: PeopleCode;
  isIntra: boolean;
  intraKind: 'ANIMAL' | 'ONIRIQUE' | 'NONE';
}

/**
 * Exact 30 Synergy Tiles matching the 6x6 Matrix on Page 4 of Amazonia v4.6 PDF
 * Numeric IDs: G1..G15 = 1..15, R1..R10 = 16..25, M1..M5 = 26..30
 */
export const TILES_META: TileMeta[] = [
  // Gardiens (1..15)
  { numericId: 1, code: 'G1', family: 'G', rowPeople: 'M', colPeople: 'R', isIntra: true, intraKind: 'ANIMAL' },
  { numericId: 2, code: 'G2', family: 'G', rowPeople: 'R', colPeople: 'M', isIntra: true, intraKind: 'ANIMAL' },
  { numericId: 3, code: 'G3', family: 'G', rowPeople: 'M', colPeople: 'O', isIntra: true, intraKind: 'ANIMAL' },
  { numericId: 4, code: 'G4', family: 'G', rowPeople: 'O', colPeople: 'M', isIntra: true, intraKind: 'ANIMAL' },
  { numericId: 5, code: 'G5', family: 'G', rowPeople: 'R', colPeople: 'O', isIntra: true, intraKind: 'ANIMAL' },
  { numericId: 6, code: 'G6', family: 'G', rowPeople: 'O', colPeople: 'R', isIntra: true, intraKind: 'ANIMAL' },
  { numericId: 7, code: 'G7', family: 'G', rowPeople: 'H', colPeople: 'M', isIntra: false, intraKind: 'NONE' },
  { numericId: 8, code: 'G8', family: 'G', rowPeople: 'E', colPeople: 'M', isIntra: false, intraKind: 'NONE' },
  { numericId: 9, code: 'G9', family: 'G', rowPeople: 'H', colPeople: 'R', isIntra: false, intraKind: 'NONE' },
  { numericId: 10, code: 'G10', family: 'G', rowPeople: 'E', colPeople: 'R', isIntra: false, intraKind: 'NONE' },
  { numericId: 11, code: 'G11', family: 'G', rowPeople: 'H', colPeople: 'O', isIntra: false, intraKind: 'NONE' },
  { numericId: 12, code: 'G12', family: 'G', rowPeople: 'E', colPeople: 'O', isIntra: false, intraKind: 'NONE' },
  { numericId: 13, code: 'G13', family: 'G', rowPeople: 'I', colPeople: 'M', isIntra: false, intraKind: 'NONE' },
  { numericId: 14, code: 'G14', family: 'G', rowPeople: 'I', colPeople: 'R', isIntra: false, intraKind: 'NONE' },
  { numericId: 15, code: 'G15', family: 'G', rowPeople: 'I', colPeople: 'O', isIntra: false, intraKind: 'NONE' },

  // Rêves (16..25)
  { numericId: 16, code: 'R1', family: 'R', rowPeople: 'H', colPeople: 'E', isIntra: true, intraKind: 'ONIRIQUE' },
  { numericId: 17, code: 'R2', family: 'R', rowPeople: 'E', colPeople: 'H', isIntra: true, intraKind: 'ONIRIQUE' },
  { numericId: 18, code: 'R3', family: 'R', rowPeople: 'M', colPeople: 'H', isIntra: false, intraKind: 'NONE' },
  { numericId: 19, code: 'R4', family: 'R', rowPeople: 'R', colPeople: 'H', isIntra: false, intraKind: 'NONE' },
  { numericId: 20, code: 'R5', family: 'R', rowPeople: 'O', colPeople: 'H', isIntra: false, intraKind: 'NONE' },
  { numericId: 21, code: 'R6', family: 'R', rowPeople: 'I', colPeople: 'H', isIntra: false, intraKind: 'NONE' },
  { numericId: 22, code: 'R7', family: 'R', rowPeople: 'M', colPeople: 'E', isIntra: false, intraKind: 'NONE' },
  { numericId: 23, code: 'R8', family: 'R', rowPeople: 'R', colPeople: 'E', isIntra: false, intraKind: 'NONE' },
  { numericId: 24, code: 'R9', family: 'R', rowPeople: 'O', colPeople: 'E', isIntra: false, intraKind: 'NONE' },
  { numericId: 25, code: 'R10', family: 'R', rowPeople: 'I', colPeople: 'E', isIntra: false, intraKind: 'NONE' },

  // Croissance / Nids (26..30)
  { numericId: 26, code: 'M1', family: 'M', rowPeople: 'M', colPeople: 'I', isIntra: false, intraKind: 'NONE' },
  { numericId: 27, code: 'M2', family: 'M', rowPeople: 'R', colPeople: 'I', isIntra: false, intraKind: 'NONE' },
  { numericId: 28, code: 'M3', family: 'M', rowPeople: 'O', colPeople: 'I', isIntra: false, intraKind: 'NONE' },
  { numericId: 29, code: 'M4', family: 'M', rowPeople: 'H', colPeople: 'I', isIntra: false, intraKind: 'NONE' },
  { numericId: 30, code: 'M5', family: 'M', rowPeople: 'E', colPeople: 'I', isIntra: false, intraKind: 'NONE' },
];

export const TILE_BY_ID: Record<number, TileMeta> = Object.fromEntries(
  TILES_META.map((t) => [t.numericId, t]),
);

export const TILE_BY_CODE: Record<string, TileMeta> = Object.fromEntries(
  TILES_META.map((t) => [t.code, t]),
);

const PAIR_LOOKUP: Record<string, TileMeta> = {};
for (const t of TILES_META) {
  PAIR_LOOKUP[`${t.rowPeople}_${t.colPeople}`] = t;
}

export function getTileForOrderedPair(x: PeopleCode, y: PeopleCode): TileMeta {
  const found = PAIR_LOOKUP[`${x}_${y}`];
  if (!found) {
    throw new Error(`Paire invalide (${x}, ${y})`);
  }
  return found;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const res: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    for (const tail of combinations(arr.slice(i + 1), k - 1)) {
      res.push([head, ...tail]);
    }
  }
  return res;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const cur = arr[i];
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) {
      res.push([cur, ...p]);
    }
  }
  return res;
}

function canonicalMirrorKey(circle: PeopleCode[]): string {
  // Circle has first element fixed (rotation invariant).
  // Reversing elements 1..N-1 produces the mirror image.
  const rev = [circle[0], ...circle.slice(1).reverse()];
  const a = circle.join('-');
  const b = rev.join('-');
  return a < b ? a : b;
}

function classifyTableRegime(
  peoples: PeopleCode[],
  nbG: number,
  nbR: number,
  nbM: number,
  intraAnimal: number,
  intraOnirique: number,
): string {
  if (intraAnimal >= 2 || (nbG >= peoples.length * 1.3 && intraAnimal >= 1)) {
    return 'Animaux Sauvages dominants';
  }
  if (intraOnirique >= 1 || nbR >= peoples.length * 0.9) {
    return 'Onirique dominante';
  }
  if (nbM >= 2 && intraAnimal === 0 && intraOnirique === 0) {
    return 'Alternée Symbiotique';
  }
  if (intraAnimal === 0 && intraOnirique === 0) {
    return 'Alternée pure (0 intra)';
  }
  return 'Mixte équilibrée';
}

/**
 * Generates exact 197 mirror-free (or 394 oriented) table configurations across N in {3,4,5,6}
 */
export function generateTopologies(
  playerCounts: (3 | 4 | 5 | 6)[] = [3, 4, 5, 6],
  oriented = false,
): TopologyConfig[] {
  const allCodes: PeopleCode[] = ['M', 'R', 'O', 'H', 'E', 'I'];
  const configs: TopologyConfig[] = [];
  let nextId = 1;

  for (const n of playerCounts) {
    const groups = combinations(allCodes, n);
    for (const grp of groups) {
      const anchor = grp[0];
      const restPerms = permutations(grp.slice(1));
      const seenMirror = new Set<string>();

      for (const tail of restPerms) {
        const circle: PeopleCode[] = [anchor, ...tail];
        if (!oriented) {
          const key = canonicalMirrorKey(circle);
          if (seenMirror.has(key)) continue;
          seenMirror.add(key);
        }

        const lisiereTiles: [number, number][] = [];
        let nbG = 0;
        let nbR = 0;
        let nbM = 0;
        let intraAnimalCount = 0;
        let intraOniriqueCount = 0;

        for (let i = 0; i < n; i++) {
          const x = circle[i];
          const y = circle[(i + 1) % n];
          const t1 = getTileForOrderedPair(x, y);
          const t2 = getTileForOrderedPair(y, x);
          lisiereTiles.push([t1.numericId, t2.numericId]);

          for (const t of [t1, t2]) {
            if (t.family === 'G') nbG++;
            else if (t.family === 'R') nbR++;
            else nbM++;
          }
          if (t1.intraKind === 'ANIMAL') intraAnimalCount++;
          if (t1.intraKind === 'ONIRIQUE') intraOniriqueCount++;
        }

        configs.push({
          id: nextId++,
          N: n,
          peoples: circle,
          oriented,
          nbG,
          nbR,
          nbM,
          intraAnimalCount,
          intraOniriqueCount,
          lisiereTiles,
          regimeTag: classifyTableRegime(
            circle,
            nbG,
            nbR,
            nbM,
            intraAnimalCount,
            intraOniriqueCount,
          ),
        });
      }
    }
  }

  return configs;
}

/**
 * Selects a balanced stratified subset across N=3..6 & regimes when fast exploration is chosen
 */
export function selectStratifiedTopologies(
  all: TopologyConfig[],
  targetCount: number,
): TopologyConfig[] {
  if (targetCount >= all.length) return all;
  const byN = new Map<number, TopologyConfig[]>();
  for (const c of all) {
    const list = byN.get(c.N) ?? [];
    list.push(c);
    byN.set(c.N, list);
  }
  const result: TopologyConfig[] = [];
  const buckets = Array.from(byN.values());
  // Proportional stratified sampling by N and evenly spaced across sorted topologies
  for (const list of buckets) {
    const share = Math.max(1, Math.round((list.length / all.length) * targetCount));
    const step = list.length / share;
    for (let i = 0; i < share && result.length < targetCount; i++) {
      const idx = Math.min(list.length - 1, Math.floor(i * step));
      result.push(list[idx]);
    }
  }
  return result.slice(0, targetCount);
}
