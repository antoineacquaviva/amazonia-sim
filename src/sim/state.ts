import type { TopologyConfig } from './types.ts';

/**
 * Contiguous Flat-Array GameState (inspired by the 256-byte NumPy layout)
 * Allows sub-microsecond cloning via TypedArray.set() for State Forking & CRN.
 */
export interface GameState {
  // meta[0]=N, [1]=P_max, [2]=turn(1..8), [3]=step, [4]=endReason(0=run,1=T8,2=Gardiens,3=Reve),
  // [5]=resonanceActivations, [6]=paradeModInstances, [7]=cascadesTotal,
  // [8]=deckCount, [9]=sidePileSabotages, [10]=sabotagesReserveUsed
  meta: Int16Array;

  // forets[ray(0..5) * 6 * 4 + p(0..5) * 4 + field]
  // 0:arbresDebout(0..3), 1:souches(0..3), 2:piege(0/1), 3:nidTileId(0 or 26..30)
  forets: Int8Array;

  // machines[ray(0..5) * 2 * 4 + type(0=Abatteuse,1=Bulldozer) * 4 + field]
  // 0:posP(0..P_max-1), 1:puissance(0..8), 2:activeTactic(0=none,1..6=T1..T6), 3:blockPowerGain(0/1)
  machines: Int8Array;

  // lisieresFurtivite[lis(0..5) * 6 * 2 + p(0..5) * 2 + field]
  // 0:nbDefenseurs, 1:nbInsectes
  lisieresFurtivite: Int8Array;

  // tuilesLisiere[lis(0..5) * 2 * 3 + slot(0..1) * 3 + field]
  // 0:tileId(1..30), 1:status(0=lisiere,1=enJeu,2=epuisee), 2:nbDefConstructeurs
  tuilesLisiere: Int8Array;

  // pisteTactiques[rank(0..5) * 4 + field]
  // 0:tileId(1..6 for T1..T6, 16..25 for R1..R10), 1:learningTokens, 2:insectesRang, 3:insectesTuile
  pisteTactiques: Int8Array;

  // pisteGardiens[trig(0..5) * 4 + field]
  // 0:gardienTileId(0 or 1..15), 1:face(1|2), 2:activatedThisTurn(0/1), 3:insectesColonie
  pisteGardiens: Int8Array;

  // Forest parcel defenders & insects (during a turn):
  // parcelUnits[ray(0..5) * 6 * 2 + p(0..5) * 2 + field] -> 0:nbDef, 1:nbInsectes
  parcelUnits: Int8Array;

  // Turn-transient combat modifiers:
  // parcelMods[ray(0..5) * 6 * 2 + p(0..5) * 2 + field] -> 0:seuilReduction, 1:autoParade(0/1)
  parcelMods: Int8Array;

  // paquetMachines: up to 32 cards.
  // 0..11 = machine ID (ray*2 + type), 99 = Sabotage
  paquetMachines: Int8Array;

  // tiragesSecrets[player(0..5) * 4 + field]
  // 0:cardDrawn(-1=none, 0..11=machine, 99=Sabotage), 1:dieM(1..6), 2:revealedMask, 3:selectedTactic(0 or 1..6)
  tiragesSecrets: Int8Array;

  // Defender assignment tracking for Step 2 & Step 6 cleanup
  // defenderTargets[player * 2 + defIdx(0..1)]: encoded slot integer
  defenderTargets: Int16Array;

  // Embedded Xorshift128+ PRNG state (4 x uint32) for deterministic CRN & State Forking
  rngState: Uint32Array;
}

export function createEmptyGameState(): GameState {
  return {
    meta: new Int16Array(12),
    forets: new Int8Array(6 * 6 * 4),
    machines: new Int8Array(6 * 2 * 4),
    lisieresFurtivite: new Int8Array(6 * 6 * 2),
    tuilesLisiere: new Int8Array(6 * 2 * 3),
    pisteTactiques: new Int8Array(6 * 4),
    pisteGardiens: new Int8Array(6 * 4),
    parcelUnits: new Int8Array(6 * 6 * 2),
    parcelMods: new Int8Array(6 * 6 * 2),
    paquetMachines: new Int8Array(32),
    tiragesSecrets: new Int8Array(6 * 4),
    defenderTargets: new Int16Array(12),
    rngState: new Uint32Array(4),
  };
}

export function cloneGameState(src: GameState): GameState {
  const dst = createEmptyGameState();
  dst.meta.set(src.meta);
  dst.forets.set(src.forets);
  dst.machines.set(src.machines);
  dst.lisieresFurtivite.set(src.lisieresFurtivite);
  dst.tuilesLisiere.set(src.tuilesLisiere);
  dst.pisteTactiques.set(src.pisteTactiques);
  dst.pisteGardiens.set(src.pisteGardiens);
  dst.parcelUnits.set(src.parcelUnits);
  dst.parcelMods.set(src.parcelMods);
  dst.paquetMachines.set(src.paquetMachines);
  dst.tiragesSecrets.set(src.tiragesSecrets);
  dst.defenderTargets.set(src.defenderTargets);
  dst.rngState.set(src.rngState);
  return dst;
}

/**
 * Deterministic Xoshiro128++ seeded via SplitMix32
 */
export function seedRng(rng: Uint32Array, seed: number): void {
  let z = seed >>> 0;
  for (let i = 0; i < 4; i++) {
    z = (z + 0x9e3779b9) >>> 0;
    let t = z ^ (z >>> 16);
    t = Math.imul(t, 0x85ebca6b);
    t ^= t >>> 13;
    t = Math.imul(t, 0xc2b2ae35);
    t ^= t >>> 16;
    rng[i] = t >>> 0;
  }
  if ((rng[0] | rng[1] | rng[2] | rng[3]) === 0) {
    rng[0] = 0x12345678;
  }
}

export function nextRandU32(rng: Uint32Array): number {
  const s0 = rng[0];
  let s1 = rng[1];
  const s2 = rng[2];
  const s3 = rng[3];
  const res = (((s0 + s3) << 7) | ((s0 + s3) >>> 25)) + s0;
  const t = s1 << 9;
  rng[2] ^= s0;
  rng[3] ^= s1;
  rng[1] ^= s2;
  rng[0] ^= s3;
  rng[2] ^= t;
  rng[3] = (rng[3] << 11) | (rng[3] >>> 21);
  return res >>> 0;
}

export function randFloat(rng: Uint32Array): number {
  return nextRandU32(rng) / 4294967296;
}

export function randInt(rng: Uint32Array, maxExclusive: number): number {
  return Math.floor(randFloat(rng) * maxExclusive);
}

export function rollDie6(rng: Uint32Array): number {
  return 1 + randInt(rng, 6);
}

/**
 * Target slot integer encoding for Defenders:
 * 0 .. 35: Forest parcel (ray * 6 + p)
 * 100 .. 135: Furtivite case (100 + lisiere * 6 + p)
 * 200 .. 211: Lisiere Synergy Tile (200 + lisiere * 2 + slotIdx)
 */
export function encodeForestTarget(ray: number, p: number): number {
  return ray * 6 + p;
}
export function encodeFurtiviteTarget(lis: number, p: number): number {
  return 100 + lis * 6 + p;
}
export function encodeTileTarget(lis: number, slot: number): number {
  return 200 + lis * 2 + slot;
}

export function initGameState(
  topology: TopologyConfig,
  pMax: number,
  seed: number,
): GameState {
  const s = createEmptyGameState();
  const N = topology.N;
  s.meta[0] = N;
  s.meta[1] = pMax;
  s.meta[2] = 1; // Turn 1
  s.meta[3] = 1; // Step 1
  s.meta[4] = 0; // Running
  s.meta[5] = 0; // resonanceActivations
  s.meta[6] = 0; // paradeModInstances
  s.meta[7] = 0; // cascadesTotal
  s.meta[8] = 2 * N; // deckCount
  s.meta[9] = 0; // sidePileSabotages
  s.meta[10] = 0;

  seedRng(s.rngState, seed);

  // 3 Standing Trees on every parcel (p = 0 .. pMax-1)
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      const fIdx = (r * 6 + p) * 4;
      s.forets[fIdx + 0] = 3; // arbresDebout
      s.forets[fIdx + 1] = 0; // souches
      s.forets[fIdx + 2] = 0; // piege
      s.forets[fIdx + 3] = 0; // nidTileId
    }
    // Machines start at p=0 (rule p=1), power=0
    for (let mType = 0; mType < 2; mType++) {
      const mIdx = (r * 2 + mType) * 4;
      s.machines[mIdx + 0] = 0;
      s.machines[mIdx + 1] = 0;
      s.machines[mIdx + 2] = 0;
      s.machines[mIdx + 3] = 0;
    }
  }

  // Lisiere Synergy Tiles
  for (let l = 0; l < N; l++) {
    const [tA, tB] = topology.lisiereTiles[l];
    const idx0 = (l * 2 + 0) * 3;
    s.tuilesLisiere[idx0 + 0] = tA;
    s.tuilesLisiere[idx0 + 1] = 0; // En lisiere
    s.tuilesLisiere[idx0 + 2] = 0;

    const idx1 = (l * 2 + 1) * 3;
    s.tuilesLisiere[idx1 + 0] = tB;
    s.tuilesLisiere[idx1 + 1] = 0;
    s.tuilesLisiere[idx1 + 2] = 0;
  }

  // Shuffle Tactics T1..T6 onto Piste des Tactiques (ranks 0..5)
  const tactics = [1, 2, 3, 4, 5, 6];
  for (let i = tactics.length - 1; i > 0; i--) {
    const j = randInt(s.rngState, i + 1);
    const tmp = tactics[i];
    tactics[i] = tactics[j];
    tactics[j] = tmp;
  }
  for (let r = 0; r < 6; r++) {
    s.pisteTactiques[r * 4 + 0] = tactics[r];
    s.pisteTactiques[r * 4 + 1] = 0;
    s.pisteTactiques[r * 4 + 2] = 0;
    s.pisteTactiques[r * 4 + 3] = 0;
  }

  // Machine deck: 2N cards (0..2N-1), shuffled
  for (let i = 0; i < 2 * N; i++) {
    s.paquetMachines[i] = i;
  }
  shuffleDeck(s.paquetMachines, 2 * N, s.rngState);

  return s;
}

export function shuffleDeck(deck: Int8Array, count: number, rng: Uint32Array): void {
  for (let i = count - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
}

export function countStandingTrees(s: GameState): number {
  const N = s.meta[0];
  const pMax = s.meta[1];
  let total = 0;
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      total += s.forets[(r * 6 + p) * 4 + 0];
    }
  }
  return total;
}

export function countStumps(s: GameState): number {
  const N = s.meta[0];
  const pMax = s.meta[1];
  let total = 0;
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      total += s.forets[(r * 6 + p) * 4 + 1];
    }
  }
  return total;
}

export function countRazedParcels(s: GameState): number {
  const N = s.meta[0];
  const pMax = s.meta[1];
  let razed = 0;
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      const fIdx = (r * 6 + p) * 4;
      if (s.forets[fIdx + 0] === 0 && s.forets[fIdx + 1] === 0) {
        razed++;
      }
    }
  }
  return razed;
}

export function countActiveGardiens(s: GameState): number {
  let count = 0;
  for (let d = 0; d < 6; d++) {
    if (s.pisteGardiens[d * 4 + 0] > 0) count++;
  }
  return count;
}

export function getMostAdvancedDreamRank(s: GameState): number {
  for (let r = 0; r < 6; r++) {
    if (s.pisteTactiques[r * 4 + 0] >= 16) {
      return r + 1; // 1..6
    }
  }
  return 0;
}
