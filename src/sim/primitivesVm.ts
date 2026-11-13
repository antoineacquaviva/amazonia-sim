import type { CompiledInstruction, CompiledVariant } from './types.ts';
import type { GameState } from './state.ts';
import { getMostAdvancedDreamRank } from './state.ts';

export interface TurnCounters {
  triggersQueueMask: number; // 6 bits: bit 0=Trig1(Parade)..bit 5=Trig6(Insecte)
  cascadesThisTurn: number;
  manipulationsThisTurn: number;
  paradeModEvents: number;
  tileBuiltCounts: Uint16Array; // index 1..30
  tileBuiltTurnSum: Uint32Array;
  tileActivations: Uint16Array; // index 1..30
  tileUpgradesF2: Uint16Array;
  tileSacrifices: Uint16Array;
  insectsMigrated: number;
  nidsActivated: number;
  trapsPlaced: number;
  sabotagesGained: number;
  paradesSucceeded: number;
}

export function createTurnCounters(): TurnCounters {
  return {
    triggersQueueMask: 0,
    cascadesThisTurn: 0,
    manipulationsThisTurn: 0,
    paradeModEvents: 0,
    tileBuiltCounts: new Uint16Array(31),
    tileBuiltTurnSum: new Uint32Array(31),
    tileActivations: new Uint16Array(31),
    tileUpgradesF2: new Uint16Array(31),
    tileSacrifices: new Uint16Array(31),
    insectsMigrated: 0,
    nidsActivated: 0,
    trapsPlaced: 0,
    sabotagesGained: 0,
    paradesSucceeded: 0,
  };
}

export function fireTrigger(counters: TurnCounters, triggerNum1to6: number): void {
  if (triggerNum1to6 >= 1 && triggerNum1to6 <= 6) {
    counters.triggersQueueMask |= 1 << (triggerNum1to6 - 1);
  }
}

export function checkGardienWinCondition(s: GameState, variant: CompiledVariant): boolean {
  const N = s.meta[0];
  let gardiensOnTrack = 0;
  for (let d = 0; d < 6; d++) {
    if (s.pisteGardiens[d * 4 + 0] > 0) gardiensOnTrack++;
  }

  let availableG = 0;
  for (let l = 0; l < N; l++) {
    for (let sl = 0; sl < 2; sl++) {
      const idx = (l * 2 + sl) * 3;
      const tid = s.tuilesLisiere[idx + 0];
      const st = s.tuilesLisiere[idx + 1];
      if (tid >= 1 && tid <= 15 && st !== 2) {
        availableG++;
      }
    }
  }

  const rule = variant.chassis.Regle_Seuil_Gardiens;
  let threshold = N;
  if (rule === 'ADAPTATIF_DISPO') {
    threshold = Math.max(2, Math.min(N, availableG));
  } else if (rule === 'COMPTEUR_RESONANCE') {
    if (s.meta[5] >= variant.chassis.Seuil_Resonance_Activations) {
      s.meta[4] = 2; // GARDIENS
      return true;
    }
    threshold = Math.max(2, Math.min(N, availableG));
  }

  if (gardiensOnTrack >= threshold) {
    s.meta[4] = 2; // GARDIENS
    return true;
  }
  return false;
}

export function checkDreamWinCondition(s: GameState): boolean {
  if (s.pisteTactiques[0] >= 16) {
    s.meta[4] = 3; // REVE
    return true;
  }
  return false;
}

function checkCondition(s: GameState, condId: number, activeDieM: number): boolean {
  const N = s.meta[0];
  const pMax = s.meta[1];
  switch (condId) {
    case 0:
      return true;
    case 1: {
      // SI_ARBRES_MENACES
      for (let r = 0; r < N; r++) {
        for (let m = 0; m < 2; m++) {
          const mIdx = (r * 2 + m) * 4;
          if (s.machines[mIdx + 2] > 0) {
            const p = s.machines[mIdx + 0];
            if (s.forets[(r * 6 + p) * 4 + 0] > 0 || s.forets[(r * 6 + p) * 4 + 1] > 0) {
              return true;
            }
          }
        }
      }
      return false;
    }
    case 2:
      return activeDieM > 0 && activeDieM % 2 === 0;
    case 3:
      return activeDieM > 0 && activeDieM % 2 === 1;
    case 4:
      return getMostAdvancedDreamRank(s) > 0;
    case 5: {
      for (let rk = 0; rk < 6; rk++) {
        if (s.pisteTactiques[rk * 4 + 2] > 0 || s.pisteTactiques[rk * 4 + 3] > 0) {
          return true;
        }
      }
      return false;
    }
    case 6: {
      for (let r = 0; r < N; r++) {
        for (let p = 0; p < pMax; p++) {
          if (s.forets[(r * 6 + p) * 4 + 1] > 0) return true;
        }
      }
      return false;
    }
    default:
      return true;
  }
}

function findMostThreatenedParcel(s: GameState): { ray: number; p: number } {
  const N = s.meta[0];
  const pMax = s.meta[1];
  let bestRay = 0;
  let bestP = 0;
  let bestThreat = -1;

  for (let r = 0; r < N; r++) {
    for (let m = 0; m < 2; m++) {
      const mIdx = (r * 2 + m) * 4;
      const tac = s.machines[mIdx + 2];
      if (tac === 0) continue;
      const mp = s.machines[mIdx + 0];
      const targets =
        tac === 1 || tac === 4
          ? [mp]
          : tac === 2 || tac === 5
            ? [Math.min(pMax - 1, mp + 1)]
            : [mp, Math.min(pMax - 1, mp + 1)];
      for (const tp of targets) {
        const fIdx = (r * 6 + tp) * 4;
        const pieces = s.forets[fIdx + 0] + s.forets[fIdx + 1];
        if (pieces === 0) continue;
        const def = s.parcelUnits[(r * 6 + tp) * 2 + 0] + s.parcelUnits[(r * 6 + tp) * 2 + 1];
        const threat = pieces + s.machines[mIdx + 1] - def + (m === 1 ? 2 : 0);
        if (threat > bestThreat) {
          bestThreat = threat;
          bestRay = r;
          bestP = tp;
        }
      }
    }
  }
  return { ray: bestRay, p: bestP };
}

function findMostAdvancedMachine(s: GameState): { ray: number; mType: number; p: number } {
  const N = s.meta[0];
  let bestR = 0;
  let bestM = 0;
  let bestP = -1;
  for (let r = 0; r < N; r++) {
    for (let m = 0; m < 2; m++) {
      const p = s.machines[(r * 2 + m) * 4 + 0];
      if (p > bestP) {
        bestP = p;
        bestR = r;
        bestM = m;
      }
    }
  }
  return { ray: bestR, mType: bestM, p: Math.max(0, bestP) };
}

export function executeInstruction(
  s: GameState,
  inst: CompiledInstruction,
  counters: TurnCounters,
  context: { nidRay?: number; nidP?: number; dreamRankIdx?: number; activeDieM?: number },
): void {
  if (!checkCondition(s, inst.conditionId, context.activeDieM ?? 0)) return;
  const N = s.meta[0];
  const pMax = s.meta[1];

  switch (inst.primitiveId) {
    case 1: {
      // MOD_SEUIL(cible, valeur_X, auto_parade_bool)
      const val = inst.param1;
      const autoParade = inst.param2 === 1;
      if (inst.targetSelectorId === 3 && context.nidRay !== undefined && context.nidP !== undefined) {
        const mIdx = (context.nidRay * 6 + context.nidP) * 2;
        s.parcelMods[mIdx + 0] += val;
        if (autoParade) s.parcelMods[mIdx + 1] = 1;
        counters.paradeModEvents++;
      } else if (inst.targetSelectorId === 4) {
        // TOUTES_PARCELLES_CIBLEES
        for (let r = 0; r < N; r++) {
          for (let m = 0; m < 2; m++) {
            const machIdx = (r * 2 + m) * 4;
            if (s.machines[machIdx + 2] > 0) {
              const p = s.machines[machIdx + 0];
              const mIdx = (r * 6 + p) * 2;
              s.parcelMods[mIdx + 0] += val;
              if (autoParade) s.parcelMods[mIdx + 1] = 1;
            }
          }
        }
        counters.paradeModEvents++;
      } else {
        const target = findMostThreatenedParcel(s);
        const mIdx = (target.ray * 6 + target.p) * 2;
        s.parcelMods[mIdx + 0] += val;
        if (autoParade) s.parcelMods[mIdx + 1] = 1;
        counters.paradeModEvents++;
      }
      break;
    }

    case 2: {
      // CREATION_ENTITE (1:PIEGE, 2:INSECTE, 3:SABOTAGE, 4:REPOUSSE_ARBRE)
      const ent = inst.param1;
      const target =
        inst.targetSelectorId === 3 && context.nidRay !== undefined && context.nidP !== undefined
          ? { ray: context.nidRay, p: context.nidP }
          : findMostThreatenedParcel(s);
      const fIdx = (target.ray * 6 + target.p) * 4;

      if (ent === 1) {
        // PIEGE
        if (s.forets[fIdx + 2] === 0) {
          s.forets[fIdx + 2] = 1;
          counters.trapsPlaced++;
          fireTrigger(counters, 2);
        }
      } else if (ent === 2) {
        // INSECTE
        s.parcelUnits[(target.ray * 6 + target.p) * 2 + 1] += 1;
        fireTrigger(counters, 6);
      } else if (ent === 3) {
        // SABOTAGE
        s.meta[9] += 1; // sidePileSabotages
        counters.sabotagesGained++;
        fireTrigger(counters, 3);
      } else if (ent === 4) {
        // REPOUSSE_ARBRE
        if (s.forets[fIdx + 1] > 0) {
          s.forets[fIdx + 1] -= 1;
          s.forets[fIdx + 0] += 1;
        }
      }
      break;
    }

    case 3: {
      // DEPLACEMENT (1:DEFENSEUR, 2:PIEGE, 3:INSECTE, 4:MACHINE_RECUL)
      const depType = inst.param1;
      const amp = Math.max(1, inst.param2);
      counters.manipulationsThisTurn++;
      if (depType === 4) {
        const mach = findMostAdvancedMachine(s);
        const mIdx = (mach.ray * 2 + mach.mType) * 4;
        if (s.machines[mIdx + 0] > 0) {
          s.machines[mIdx + 0] = Math.max(0, s.machines[mIdx + 0] - amp);
        }
      } else if (depType === 1) {
        // Move a defender from least threatened to most threatened
        const tgt = findMostThreatenedParcel(s);
        s.parcelUnits[(tgt.ray * 6 + tgt.p) * 2 + 0] += 1;
      } else if (depType === 3) {
        const tgt = findMostThreatenedParcel(s);
        const np = Math.min(pMax - 1, tgt.p + amp);
        s.parcelUnits[(tgt.ray * 6 + np) * 2 + 1] += 1;
      }
      break;
    }

    case 4: {
      // MOD_PUISSANCE (delta, blockPowerGain)
      let bestR = 0;
      let bestM = 0;
      let maxPow = -1;
      for (let r = 0; r < N; r++) {
        for (let m = 0; m < 2; m++) {
          const pw = s.machines[(r * 2 + m) * 4 + 1];
          if (pw > maxPow) {
            maxPow = pw;
            bestR = r;
            bestM = m;
          }
        }
      }
      const mIdx = (bestR * 2 + bestM) * 4;
      if (inst.param1 < 0 && s.machines[mIdx + 1] > 0) {
        s.machines[mIdx + 1] = Math.max(0, s.machines[mIdx + 1] + inst.param1);
      }
      if (inst.param2 === 1) {
        s.machines[mIdx + 3] = 1;
      }
      break;
    }

    case 5: {
      // MOD_APPRENTISSAGE (-X learning tokens on leading or active tactic)
      let targetRank = -1;
      let maxTok = 0;
      for (let rk = 0; rk < 6; rk++) {
        const tid = s.pisteTactiques[rk * 4 + 0];
        const tok = s.pisteTactiques[rk * 4 + 1];
        if (tid <= 6 && tok > maxTok) {
          maxTok = tok;
          targetRank = rk;
        }
      }
      if (targetRank >= 0) {
        s.pisteTactiques[targetRank * 4 + 1] = Math.max(
          0,
          s.pisteTactiques[targetRank * 4 + 1] - Math.max(1, inst.param1),
        );
      }
      break;
    }

    case 6: {
      // PERMUTATION_PISTE (direction -1=GAUCHE, +1=DROITE)
      counters.manipulationsThisTurn++;
      let rk = context.dreamRankIdx ?? -1;
      if (rk < 0) {
        for (let i = 0; i < 6; i++) {
          if (s.pisteTactiques[i * 4 + 0] >= 16) {
            rk = i;
            break;
          }
        }
      }
      if (rk >= 0) {
        const dest = rk + inst.param1;
        if (dest >= 0 && dest <= 5) {
          for (let f = 0; f < 4; f++) {
            const tmp = s.pisteTactiques[rk * 4 + f];
            s.pisteTactiques[rk * 4 + f] = s.pisteTactiques[dest * 4 + f];
            s.pisteTactiques[dest * 4 + f] = tmp;
          }
          checkDreamWinCondition(s);
        }
      }
      break;
    }

    case 7: {
      // PARTAGE_INFO_ETAT_GARDIEN (3=FLIP_GARDIEN_F2, 4=REACTIVER_GARDIEN)
      const act = inst.param1;
      if (act === 3) {
        for (let d = 0; d < 6; d++) {
          if (s.pisteGardiens[d * 4 + 0] > 0 && s.pisteGardiens[d * 4 + 1] === 1) {
            s.pisteGardiens[d * 4 + 1] = 2;
            counters.tileUpgradesF2[s.pisteGardiens[d * 4 + 0]]++;
            break;
          }
        }
      } else if (act === 4) {
        for (let d = 0; d < 6; d++) {
          if (s.pisteGardiens[d * 4 + 0] > 0 && s.pisteGardiens[d * 4 + 2] === 0) {
            fireTrigger(counters, d + 1);
            break;
          }
        }
      }
      break;
    }
  }
}

/**
 * Vectorized 6-bit Cascade Loop for Gardiens Piste (strictly 1 activation max per Gardien tile per turn)
 */
export function resolveGardienCascades(
  s: GameState,
  variant: CompiledVariant,
  counters: TurnCounters,
): void {
  let safety = 0;
  while (counters.triggersQueueMask !== 0 && safety < 18 && s.meta[4] === 0) {
    safety++;
    // Pop lowest active trigger bit (1..6)
    let trigIdx = -1;
    for (let d = 0; d < 6; d++) {
      if ((counters.triggersQueueMask & (1 << d)) !== 0) {
        trigIdx = d;
        counters.triggersQueueMask &= ~(1 << d);
        break;
      }
    }
    if (trigIdx < 0) break;

    const gBase = trigIdx * 4;
    const tileId = s.pisteGardiens[gBase + 0];
    const alreadyActivated = s.pisteGardiens[gBase + 2];

    if (tileId > 0 && alreadyActivated === 0) {
      s.pisteGardiens[gBase + 2] = 1; // anti-loop lock
      counters.cascadesThisTurn++;
      s.meta[7]++;
      counters.tileActivations[tileId]++;

      const slot = variant.slotsByNumericId[tileId];
      if (slot) {
        const curFace = s.pisteGardiens[gBase + 1];
        // Double-face upgrade decision: spend this opening to flip F1 -> F2 if on F1
        if (slot.lifecycle === 1 && curFace === 1) {
          s.pisteGardiens[gBase + 1] = 2;
          counters.tileUpgradesF2[tileId]++;
        } else if (slot.lifecycle === 2 && slot.sacrifice.length > 0 && s.meta[2] >= 3) {
          // Sacrifice One-Shot when threat justifies or late game
          for (const inst of slot.sacrifice) {
            executeInstruction(s, inst, counters, {});
          }
          counters.tileSacrifices[tileId]++;
          if (slot.sacrificeModality === 0) {
            // RETOUR_FACE_EPUISEE: stays disabled on piste? Wait: mark exhausted on lisiere & clear piste or keep exhausted
            s.pisteGardiens[gBase + 0] = 0;
            markLisiereTileStatus(s, tileId, 2);
          } else {
            // RENVOI_LISIERE: returns to Face 1 on lisiere to be rebuildable
            s.pisteGardiens[gBase + 0] = 0;
            s.pisteGardiens[gBase + 1] = 1;
            markLisiereTileStatus(s, tileId, 0);
          }
        } else {
          const effList = curFace === 2 && slot.face2.length > 0 ? slot.face2 : slot.face1;
          for (const inst of effList) {
            executeInstruction(s, inst, counters, {});
          }
        }
      }

      // Resonance: opening a Gardien Slot lights Trigger 4 (Gardien / Resonance)
      if (trigIdx !== 3) {
        fireTrigger(counters, 4);
      } else {
        s.meta[5]++; // resonanceActivations
        checkGardienWinCondition(s, variant);
      }

      // Check Colonisation des Gardiens hook SUR_DECLENCHEUR (hook 4)
      if (s.pisteGardiens[gBase + 3] > 0) {
        const colSlot = variant.slotsByNumericId[32];
        if (colSlot && colSlot.insectHook === 4) {
          for (const inst of colSlot.face1) {
            executeInstruction(s, inst, counters, {});
          }
          if (colSlot.insectConsumption === 0) {
            s.pisteGardiens[gBase + 3] = Math.max(0, s.pisteGardiens[gBase + 3] - 1);
          }
        }
      }
    } else if (tileId === 0 && s.pisteGardiens[gBase + 3] > 0) {
      // Colony insect on empty trigger slot produces rescue effect if SUR_DECLENCHEUR
      const colSlot = variant.slotsByNumericId[32];
      if (colSlot && colSlot.insectHook === 4) {
        for (const inst of colSlot.face1) {
          executeInstruction(s, inst, counters, {});
        }
        if (colSlot.insectConsumption === 0) {
          s.pisteGardiens[gBase + 3] = Math.max(0, s.pisteGardiens[gBase + 3] - 1);
        }
      }
    }
  }
}

export function markLisiereTileStatus(s: GameState, tileId: number, status: number): void {
  const N = s.meta[0];
  for (let l = 0; l < N; l++) {
    for (let sl = 0; sl < 2; sl++) {
      const idx = (l * 2 + sl) * 3;
      if (s.tuilesLisiere[idx + 0] === tileId) {
        s.tuilesLisiere[idx + 1] = status;
        return;
      }
    }
  }
}
