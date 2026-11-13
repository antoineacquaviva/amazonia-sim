import type { BotProfile, CompiledVariant } from './types.ts';
import type { GameState } from './state.ts';
import {
  encodeForestTarget,
  encodeFurtiviteTarget,
  encodeTileTarget,
  getMostAdvancedDreamRank,
} from './state.ts';

export type ForkOverrideMode =
  | 'NORMAL'
  | 'FORCED_BUILD_TILE'
  | 'FORCED_STEALTH'
  | 'FORCED_DEFENSE_ONLY';

export interface Step2Result {
  revisionsCount: number;
}

function getNeighborLisieres(N: number, player: number): [number, number] {
  const left = (player - 1 + N) % N;
  const right = player;
  return [left, right];
}

function getTileFamily(tileId: number): 'G' | 'R' | 'M' {
  if (tileId <= 15) return 'G';
  if (tileId <= 25) return 'R';
  return 'M';
}

function scoreLocalThreat(s: GameState, ray: number, p: number): number {
  const fIdx = (ray * 6 + p) * 4;
  return s.forets[fIdx + 0] * 2 + s.forets[fIdx + 1];
}

function findBestForestDefenseParcel(s: GameState, ray: number): number {
  const pMax = s.meta[1];
  let bestP = 0;
  let bestScore = -1;
  for (let p = 0; p < pMax; p++) {
    let threat = scoreLocalThreat(s, ray, p);
    for (let m = 0; m < 2; m++) {
      const mp = s.machines[(ray * 2 + m) * 4 + 0];
      const mPow = s.machines[(ray * 2 + m) * 4 + 1];
      if (mp === p) threat += 6 + mPow * 2;
      if (mp + 1 === p) threat += 4 + mPow;
    }
    if (threat > bestScore) {
      bestScore = threat;
      bestP = p;
    }
  }
  return bestP;
}

function countDeckSabotages(s: GameState): number {
  let c = s.meta[9];
  for (let i = 0; i < s.meta[8]; i++) {
    if (s.paquetMachines[i] === 99) c++;
  }
  return c;
}

function isPlayerSecretThreateningOwnRay(s: GameState, player: number): {
  threatened: boolean;
  targetP: number;
  isBulldozerOnStumps: boolean;
} {
  const pMax = s.meta[1];
  const card = s.tiragesSecrets[player * 4 + 0];
  const tac = s.tiragesSecrets[player * 4 + 3];
  if (card === 99 || tac === 0) {
    return { threatened: false, targetP: 0, isBulldozerOnStumps: false };
  }

  const ray = Math.floor(card / 2);
  const mType = card % 2;
  const mp = s.machines[(ray * 2 + mType) * 4 + 0];

  if (ray === player) {
    let targetP = mp;
    if (tac === 2 || tac === 5) targetP = Math.min(pMax - 1, mp + 1);
    if (tac === 3 || tac === 6) {
      const nextP = Math.min(pMax - 1, mp + 1);
      targetP =
        scoreLocalThreat(s, ray, nextP) > scoreLocalThreat(s, ray, mp) ? nextP : mp;
    }
    const fIdx = (ray * 6 + targetP) * 4;
    const hasRelevant = mType === 0 ? s.forets[fIdx + 0] > 0 : s.forets[fIdx + 1] > 0;
    if (hasRelevant) {
      return {
        threatened: true,
        targetP,
        isBulldozerOnStumps: mType === 1 && s.forets[fIdx + 1] > 0,
      };
    }
  }
  return { threatened: false, targetP: 0, isBulldozerOnStumps: false };
}

function evaluateTileBuildValue(s: GameState, tileId: number, turn: number, profile: BotProfile): number {
  const N = s.meta[0];
  const fam = getTileFamily(tileId);
  let activeG = 0;
  for (let d = 0; d < 6; d++) {
    if (s.pisteGardiens[d * 4 + 0] > 0) activeG++;
  }

  const coopBonus = profile === 'REFLEXE' ? -1.0 : 0.4;

  if (fam === 'G') {
    const progress = activeG >= N - 1 ? 5.8 : 4.6;
    return progress + coopBonus + ((tileId % 4) * 0.12);
  }
  if (fam === 'R') {
    const dreamRank = getMostAdvancedDreamRank(s);
    if (dreamRank === 2) return 11.5 + coopBonus;
    if (dreamRank >= 3) return 6.2 + coopBonus;
    return 4.7 + (turn <= 5 ? 0.5 : 0) + coopBonus;
  }
  // M (Croissance Nid)
  return (turn <= 4 ? 5.2 : 3.2) + coopBonus;
}

function evaluateStealthSlotValue(
  s: GameState,
  lis: number,
  p: number,
  sabotageSaturation: number,
): number {
  const N = s.meta[0];
  const leftRay = lis;
  const rightRay = (lis + 1) % N;

  let value = 0;
  for (const ray of [leftRay, rightRay]) {
    const fIdx = (ray * 6 + p) * 4;
    const hasPieces = s.forets[fIdx + 0] + s.forets[fIdx + 1] > 0;
    const hasMachine =
      s.machines[(ray * 2 + 0) * 4 + 0] === p || s.machines[(ray * 2 + 1) * 4 + 0] === p;
    if (!hasMachine && hasPieces && s.forets[fIdx + 2] === 0) {
      value += 2.6;
    } else if (hasMachine && sabotageSaturation < N) {
      value += Math.max(0.4, 2.8 - sabotageSaturation * 0.6);
    }
  }
  return value;
}

function selectFirstDefender(
  s: GameState,
  player: number,
  profile: BotProfile,
  override: ForkOverrideMode,
): number {
  const N = s.meta[0];
  const pMax = s.meta[1];
  const [leftLis, rightLis] = getNeighborLisieres(N, player);

  if (override === 'FORCED_DEFENSE_ONLY') {
    const own = isPlayerSecretThreateningOwnRay(s, player);
    return encodeForestTarget(
      player,
      own.threatened ? own.targetP : findBestForestDefenseParcel(s, player),
    );
  }

  if (override === 'FORCED_BUILD_TILE') {
    for (const lis of [leftLis, rightLis]) {
      for (let sl = 0; sl < 2; sl++) {
        if (s.tuilesLisiere[(lis * 2 + sl) * 3 + 1] === 0) {
          return encodeTileTarget(lis, sl);
        }
      }
    }
  }

  if (override === 'FORCED_STEALTH') {
    const mp = s.machines[(player * 2 + 0) * 4 + 0];
    return encodeFurtiviteTarget(leftLis, Math.min(pMax - 1, mp));
  }

  const ownThreat = isPlayerSecretThreateningOwnRay(s, player);
  if (ownThreat.threatened) {
    if (profile === 'REFLEXE') {
      return encodeForestTarget(player, ownThreat.targetP);
    }
    // Cooperatif & Oracle anchor on own forest when threatened, especially Bulldozer on stumps
    if (ownThreat.isBulldozerOnStumps || s.meta[2] >= 2) {
      return encodeForestTarget(player, ownThreat.targetP);
    }
  }

  const sabCount = countDeckSabotages(s);
  let bestTarget = encodeFurtiviteTarget(leftLis, 0);
  let bestVal = -999;

  for (const lis of [leftLis, rightLis]) {
    for (let sl = 0; sl < 2; sl++) {
      const idx = (lis * 2 + sl) * 3;
      if (s.tuilesLisiere[idx + 1] === 0) {
        const tid = s.tuilesLisiere[idx + 0];
        const val = evaluateTileBuildValue(s, tid, s.meta[2], profile);
        if (val > bestVal) {
          bestVal = val;
          bestTarget = encodeTileTarget(lis, sl);
        }
      }
    }
    for (let p = 0; p < pMax; p++) {
      const val = evaluateStealthSlotValue(s, lis, p, sabCount);
      if (val > bestVal) {
        bestVal = val;
        bestTarget = encodeFurtiviteTarget(lis, p);
      }
    }
  }

  if (profile === 'REFLEXE' && bestVal < 6.8) {
    return encodeForestTarget(player, findBestForestDefenseParcel(s, player));
  }

  return bestTarget;
}

function computeThreatMap(
  s: GameState,
  firstTargets: Int16Array,
  profile: BotProfile,
): Float32Array {
  const N = s.meta[0];
  const pMax = s.meta[1];
  const threat = new Float32Array(N * 6);

  if (profile === 'ORACLE') {
    for (let pl = 0; pl < N; pl++) {
      const card = s.tiragesSecrets[pl * 4 + 0];
      const tac = s.tiragesSecrets[pl * 4 + 3];
      if (card === 99 || tac === 0) continue;
      const ray = Math.floor(card / 2);
      const mType = card % 2;
      const mp = s.machines[(ray * 2 + mType) * 4 + 0];
      const mPow = s.machines[(ray * 2 + mType) * 4 + 1];
      const targets =
        tac === 1 || tac === 4
          ? [mp]
          : tac === 2 || tac === 5
            ? [Math.min(pMax - 1, mp + 1)]
            : [mp, Math.min(pMax - 1, mp + 1)];
      for (const tp of targets) {
        const fIdx = (ray * 6 + tp) * 4;
        const pieces = s.forets[fIdx + 0] + s.forets[fIdx + 1];
        if (pieces > 0 && s.forets[fIdx + 2] === 0) {
          const mod = tac === 6 ? -2 : tac >= 3 ? -1 : 0;
          const seuil = Math.max(1, pieces + mPow + mod);
          // Only high threat if Bulldozer hits stumps OR Abatteuse hits trees AND affordable
          const relevant = mType === 1 ? s.forets[fIdx + 1] > 0 : s.forets[fIdx + 0] > 0;
          if (relevant) {
            threat[ray * 6 + tp] += (mType === 1 ? 14 : 9) - seuil * 0.6;
          }
        }
      }
    }
    return threat;
  }

  for (let r = 0; r < N; r++) {
    for (let m = 0; m < 2; m++) {
      const mp = s.machines[(r * 2 + m) * 4 + 0];
      const mPow = s.machines[(r * 2 + m) * 4 + 1];
      const f0 = (r * 6 + mp) * 4;
      const relevant0 = m === 0 ? s.forets[f0 + 0] > 0 : s.forets[f0 + 1] > 0;
      const baseRisk = profile === 'COOPERATIF' ? 1.0 : 0.65;
      if (relevant0 && s.forets[f0 + 2] === 0) {
        threat[r * 6 + mp] += (5.0 + mPow * 1.3) * baseRisk;
      }
      const nextP = Math.min(pMax - 1, mp + 1);
      const f1 = (r * 6 + nextP) * 4;
      const relevant1 = m === 0 ? s.forets[f1 + 0] > 0 : s.forets[f1 + 1] > 0;
      if (relevant1 && s.forets[f1 + 2] === 0) {
        threat[r * 6 + nextP] += (3.2 + mPow * 0.9) * baseRisk;
      }
    }

    if (profile === 'COOPERATIF') {
      const ft = firstTargets[r];
      if (ft < 100) {
        const p = ft % 6;
        threat[r * 6 + p] += 6.5;
      } else {
        for (let p = 0; p < pMax; p++) {
          threat[r * 6 + p] *= 0.6;
        }
      }
    }
  }

  return threat;
}

function countAssignedAtSlot(
  firstTargets: Int16Array,
  secondTargets: Int16Array,
  N: number,
  slot: number,
  excludePlayer = -1,
): number {
  let c = 0;
  for (let i = 0; i < N; i++) {
    if (firstTargets[i] === slot) c++;
    if (i !== excludePlayer && secondTargets[i] === slot) c++;
  }
  return c;
}

function findActiveMachineTargetingParcel(
  s: GameState,
  ray: number,
  p: number,
): { pow: number; mod: number; mType: number } | null {
  const N = s.meta[0];
  const pMax = s.meta[1];
  for (let pl = 0; pl < N; pl++) {
    const card = s.tiragesSecrets[pl * 4 + 0];
    const tac = s.tiragesSecrets[pl * 4 + 3];
    if (card === 99 || tac === 0) continue;
    const mr = Math.floor(card / 2);
    if (mr !== ray) continue;
    const mt = card % 2;
    const mp = s.machines[(mr * 2 + mt) * 4 + 0];
    const hit =
      tac === 1 || tac === 4
        ? mp === p
        : tac === 2 || tac === 5
          ? Math.min(pMax - 1, mp + 1) === p
          : mp === p || Math.min(pMax - 1, mp + 1) === p;
    if (hit) {
      return {
        pow: s.machines[(mr * 2 + mt) * 4 + 1],
        mod: tac === 6 ? -2 : tac >= 3 ? -1 : 0,
        mType: mt,
      };
    }
  }
  return null;
}

function selectSecondDefender(
  s: GameState,
  player: number,
  firstTargets: Int16Array,
  currentSecondTargets: Int16Array,
  threatMap: Float32Array,
  profile: BotProfile,
  override: ForkOverrideMode,
): number {
  const N = s.meta[0];
  const pMax = s.meta[1];

  if (override === 'FORCED_BUILD_TILE') {
    for (let l = 0; l < N; l++) {
      for (let sl = 0; sl < 2; sl++) {
        if (s.tuilesLisiere[(l * 2 + sl) * 3 + 1] === 0) {
          const tgt = encodeTileTarget(l, sl);
          if (countAssignedAtSlot(firstTargets, currentSecondTargets, N, tgt, player) === 1) {
            return tgt;
          }
        }
      }
    }
  }

  if (override === 'FORCED_STEALTH') {
    for (let l = 0; l < N; l++) {
      for (let p = 0; p < pMax; p++) {
        const tgt = encodeFurtiviteTarget(l, p);
        if (countAssignedAtSlot(firstTargets, currentSecondTargets, N, tgt, player) === 1) {
          return tgt;
        }
      }
    }
  }

  const sabCount = countDeckSabotages(s);
  let bestSlot = encodeForestTarget(player, 0);
  let bestUtility = -999;

  // 1. Evaluate all Lisiere Synergy Tiles across entire board
  if (override !== 'FORCED_DEFENSE_ONLY') {
    for (let l = 0; l < N; l++) {
      for (let sl = 0; sl < 2; sl++) {
        const idx = (l * 2 + sl) * 3;
        if (s.tuilesLisiere[idx + 1] !== 0) continue;
        const tgt = encodeTileTarget(l, sl);
        const already = countAssignedAtSlot(firstTargets, currentSecondTargets, N, tgt, player);
        if (already >= 2) continue;
        const tileId = s.tuilesLisiere[idx + 0];
        let val = evaluateTileBuildValue(s, tileId, s.meta[2], profile);
        if (already === 1) val += profile === 'REFLEXE' ? 2.2 : 3.6;
        else val -= 3.5;
        if (val > bestUtility) {
          bestUtility = val;
          bestSlot = tgt;
        }
      }
    }

    // 2. Evaluate all Furtivite slots across entire board
    for (let l = 0; l < N; l++) {
      for (let p = 0; p < pMax; p++) {
        const tgt = encodeFurtiviteTarget(l, p);
        const already = countAssignedAtSlot(firstTargets, currentSecondTargets, N, tgt, player);
        const hasInsect = s.lisieresFurtivite[(l * 6 + p) * 2 + 1] > 0 ? 1 : 0;
        if (already + hasInsect >= 2) continue;
        let val = evaluateStealthSlotValue(s, l, p, sabCount);
        if (already === 1 || hasInsect === 1) val += 3.4;
        else val -= 3.8;
        if (val > bestUtility) {
          bestUtility = val;
          bestSlot = tgt;
        }
      }
    }
  }

  // 3. Evaluate all Forest parcels across entire board
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      const fIdx = (r * 6 + p) * 4;
      const pieces = s.forets[fIdx + 0] + s.forets[fIdx + 1];
      if (pieces === 0 || s.forets[fIdx + 2] === 1) continue;
      const tgt = encodeForestTarget(r, p);
      const already = countAssignedAtSlot(firstTargets, currentSecondTargets, N, tgt, player);
      const baseT = threatMap[r * 6 + p];
      const currentDef = already + s.parcelUnits[(r * 6 + p) * 2 + 1];

      let val = baseT;
      if (profile === 'ORACLE') {
        const mach = findActiveMachineTargetingParcel(s, r, p);
        if (mach !== null) {
          const needed = Math.max(1, pieces + mach.pow + mach.mod);
          if (currentDef < needed && needed <= currentDef + (N - player)) {
            val += currentDef + 1 === needed ? 16 : 9;
          } else {
            val = -50; // Already parried or impossible to reach!
          }
        } else {
          val = -50;
        }
      } else {
        if (already >= 1 && baseT > 4) val += profile === 'COOPERATIF' ? 5.2 : 2.5;
        if (already >= 3) val -= 9;
      }

      if (val > bestUtility) {
        bestUtility = val;
        bestSlot = tgt;
      }
    }
  }

  return bestSlot;
}

function applyDefenderToBoard(s: GameState, target: number): void {
  if (target < 100) {
    const ray = Math.floor(target / 6);
    const p = target % 6;
    s.parcelUnits[(ray * 6 + p) * 2 + 0] += 1;
  } else if (target < 200) {
    const rem = target - 100;
    const lis = Math.floor(rem / 6);
    const p = rem % 6;
    s.lisieresFurtivite[(lis * 6 + p) * 2 + 0] += 1;
  } else {
    const rem = target - 200;
    const lis = Math.floor(rem / 2);
    const sl = rem % 2;
    s.tuilesLisiere[(lis * 2 + sl) * 3 + 2] += 1;
  }
}

export function resolveStep2Defenders(
  s: GameState,
  variant: CompiledVariant,
  profile: BotProfile,
  override: ForkOverrideMode = 'NORMAL',
): Step2Result {
  const N = s.meta[0];
  const firstTargets = new Int16Array(N);
  const secondTargets = new Int16Array(N);
  secondTargets.fill(-1);

  // 2.1: Irrevocable 1st Defender placement
  for (let i = 0; i < N; i++) {
    const t1 = selectFirstDefender(s, i, profile, override);
    firstTargets[i] = t1;
    s.defenderTargets[i * 2 + 0] = t1;
    applyDefenderToBoard(s, t1);
  }

  // Public belief update
  const threatMap = computeThreatMap(s, firstTargets, profile);

  // 2.2: Initial intentions ("En reflexion")
  for (let i = 0; i < N; i++) {
    secondTargets[i] = selectSecondDefender(
      s,
      i,
      firstTargets,
      secondTargets,
      threatMap,
      profile,
      override,
    );
  }

  let revisionsCount = 0;
  const allowRevision =
    variant.chassis.Revision_Etape_2_2 &&
    profile !== 'REFLEXE' &&
    override === 'NORMAL';

  if (allowRevision) {
    for (let round = 0; round < 3; round++) {
      let changed = false;
      for (let i = 0; i < N; i++) {
        const cur = secondTargets[i];
        const countAtCur = countAssignedAtSlot(firstTargets, secondTargets, N, cur, -1);
        const isLisiereOrStealth = cur >= 100;
        const hasConflict = isLisiereOrStealth && (countAtCur === 1 || countAtCur >= 3);
        if (hasConflict) {
          const nextTarget = selectSecondDefender(
            s,
            i,
            firstTargets,
            secondTargets,
            threatMap,
            profile,
            override,
          );
          if (nextTarget !== cur) {
            secondTargets[i] = nextTarget;
            revisionsCount++;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  for (let i = 0; i < N; i++) {
    s.defenderTargets[i * 2 + 1] = secondTargets[i];
    applyDefenderToBoard(s, secondTargets[i]);
  }

  return { revisionsCount };
}
