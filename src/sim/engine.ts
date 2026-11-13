import type {
  BotProfile,
  CompiledVariant,
  EndCondition,
  NarrativeStepLog,
  NarrativeTrace,
  TopologyConfig,
} from './types.ts';
import type { GameState } from './state.ts';
import {
  cloneGameState,
  countActiveGardiens,
  countRazedParcels,
  countStandingTrees,
  countStumps,
  getMostAdvancedDreamRank,
  initGameState,
  rollDie6,
  shuffleDeck,
} from './state.ts';
import {
  checkDreamWinCondition,
  checkGardienWinCondition,
  createTurnCounters,
  executeInstruction,
  fireTrigger,
  markLisiereTileStatus,
  resolveGardienCascades,
  type TurnCounters,
} from './primitivesVm.ts';
import { resolveStep2Defenders, type ForkOverrideMode } from './bots.ts';

export interface SingleGameOutput {
  endCondition: EndCondition;
  finalTurn: number;
  initialTrees: number;
  finalTrees: number;
  scoreRatio: number;
  razedParcelsPct: number;
  tensionGap: number;
  revisionsStep2: number;
  cascadesPerTurn: number;
  manipulationsPerTurn: number;
  paradeModStackMean: number;
  counters: TurnCounters;
  erosionByTurn: { treesPct: number; stumpsPct: number; razedPct: number }[];
  trace?: NarrativeTrace;
}

const END_CODE_MAP: Record<number, EndCondition> = {
  0: 'EN_COURS',
  1: 'TOUR_8',
  2: 'GARDIENS',
  3: 'REVE',
};

function tacticMod(tactic: number): number {
  if (tactic === 6) return -2;
  if (tactic >= 3 && tactic <= 5) return -1;
  return 0;
}

function pickGardienTriggerSlot(s: GameState, affinity: number): number {
  if (affinity >= 1 && affinity <= 6 && s.pisteGardiens[(affinity - 1) * 4 + 0] === 0) {
    return affinity - 1;
  }
  // Prefer Trigger 1 (Parade), 2 (Piege), 3 (Sabotage), 5 (Reve), 6 (Insecte), 4 (Resonance)
  const pref = [0, 1, 2, 4, 5, 3];
  for (const d of pref) {
    if (s.pisteGardiens[d * 4 + 0] === 0) return d;
  }
  return -1;
}

function insertDreamAtRank6(s: GameState, tileId: number): number {
  // Insert R1..R10 at Rank 6 (index 5).
  // Any dreams occupying the rightmost ranks are pushed 1 rank left, ejecting the rightmost Tactique tile.
  let firstDreamBlock = 5;
  while (firstDreamBlock > 0 && s.pisteTactiques[(firstDreamBlock - 1) * 4 + 0] >= 16) {
    firstDreamBlock--;
  }
  if (firstDreamBlock === 0) {
    // All 6 ranks already dreams -> replace index 5
    s.pisteTactiques[5 * 4 + 0] = tileId;
    return 5;
  }

  // Eject the tactic right before the dream block (at index firstDreamBlock - 1)
  // Shift the dream block left by 1 (from firstDreamBlock..5 -> firstDreamBlock-1..4)
  for (let rk = firstDreamBlock; rk <= 5; rk++) {
    const src = rk * 4;
    const dst = (rk - 1) * 4;
    s.pisteTactiques[dst + 0] = s.pisteTactiques[src + 0];
    s.pisteTactiques[dst + 1] = 0;
    // Safety rule (Section 4.2): insects attached to ejected tactic stay at Rank 6 on new Dream
    if (rk === firstDreamBlock) {
      s.pisteTactiques[5 * 4 + 2] += s.pisteTactiques[dst + 2] + s.pisteTactiques[dst + 3];
    }
    s.pisteTactiques[dst + 2] = s.pisteTactiques[src + 2];
    s.pisteTactiques[dst + 3] = s.pisteTactiques[src + 3];
  }

  s.pisteTactiques[5 * 4 + 0] = tileId;
  s.pisteTactiques[5 * 4 + 1] = 0;
  s.pisteTactiques[5 * 4 + 3] = 0;
  return 5;
}

function findNidParcel(
  s: GameState,
  topology: TopologyConfig,
  lisiereIdx: number,
): { ray: number; p: number } | null {
  const N = s.meta[0];
  const pMax = s.meta[1];
  const rA = lisiereIdx;
  const rB = (lisiereIdx + 1) % N;
  const candidates =
    topology.peoples[rA] === 'I' || topology.peoples[rB] === 'I'
      ? [rA, rB]
      : [rA, rB];

  for (const r of candidates) {
    for (let p = pMax - 1; p >= 0; p--) {
      const fIdx = (r * 6 + p) * 4;
      const hasPieces = s.forets[fIdx + 0] + s.forets[fIdx + 1] > 0;
      const hasMachine =
        s.machines[(r * 2 + 0) * 4 + 0] === p || s.machines[(r * 2 + 1) * 4 + 0] === p;
      const hasNid = s.forets[fIdx + 3] > 0;
      if (hasPieces && !hasMachine && !hasNid) {
        return { ray: r, p };
      }
    }
  }
  return null;
}

function runTurn(
  s: GameState,
  topology: TopologyConfig,
  variant: CompiledVariant,
  profile: BotProfile,
  counters: TurnCounters,
  override: ForkOverrideMode,
): { revisions: number; turnSummary: string } {
  const N = s.meta[0];
  const pMax = s.meta[1];
  const turn = s.meta[2];
  const notes: string[] = [];

  // Reset per-turn Gardien anti-loop flags & transient parcel modifiers
  counters.triggersQueueMask = 0;
  for (let d = 0; d < 6; d++) s.pisteGardiens[d * 4 + 2] = 0;
  s.parcelMods.fill(0);
  for (let r = 0; r < N; r++) {
    for (let m = 0; m < 2; m++) {
      s.machines[(r * 2 + m) * 4 + 2] = 0;
      s.machines[(r * 2 + m) * 4 + 3] = 0;
    }
  }

  // ==================== ÉTAPE 1 : PLAN SECRET ====================
  s.meta[3] = 1;
  for (let pl = 0; pl < N; pl++) {
    const card = s.meta[8] > 0 ? s.paquetMachines[--s.meta[8]] : 99;
    const d1 = rollDie6(s.rngState);
    const d2 = rollDie6(s.rngState);
    const dieM = d1 < d2 ? d1 : d2;
    const rankTile = s.pisteTactiques[(dieM - 1) * 4 + 0];
    const selectedTactic = card === 99 || rankTile >= 16 ? 0 : rankTile;
    const tBase = pl * 4;
    s.tiragesSecrets[tBase + 0] = card;
    s.tiragesSecrets[tBase + 1] = dieM;
    s.tiragesSecrets[tBase + 2] = 0;
    s.tiragesSecrets[tBase + 3] = selectedTactic;
  }

  // ==================== ÉTAPE 2 : DÉFENSEURS (MUET) ====================
  s.meta[3] = 2;
  const step2Res = resolveStep2Defenders(s, variant, profile, override);

  // ==================== ÉTAPE 3 : TUILES & RÉVÉLATION ====================
  s.meta[3] = 3;
  // 3.1: Construction des Tuiles de Synergie à 2 Défenseurs
  for (let l = 0; l < N; l++) {
    for (let sl = 0; sl < 2; sl++) {
      const idx = (l * 2 + sl) * 3;
      const tileId = s.tuilesLisiere[idx + 0];
      const status = s.tuilesLisiere[idx + 1];
      const defCount = s.tuilesLisiere[idx + 2];

      if (status === 0 && defCount >= 2) {
        if (tileId <= 15) {
          // GARDIEN G1..G15
          const slot = variant.slotsByNumericId[tileId];
          const trigIdx = pickGardienTriggerSlot(s, slot?.triggerAffinity ?? 0);
          if (trigIdx >= 0) {
            s.tuilesLisiere[idx + 1] = 1; // En jeu
            s.pisteGardiens[trigIdx * 4 + 0] = tileId;
            s.pisteGardiens[trigIdx * 4 + 1] = 1; // Face 1
            counters.tileBuiltCounts[tileId]++;
            counters.tileBuiltTurnSum[tileId] += turn;
            notes.push(`Pose ${slot?.slotCode ?? 'G' + tileId}->D${trigIdx + 1}`);
            // If Trigger 4 (index 3) already had a tile or this is placed on piste, resonance if Trig 4 occupied
            if (trigIdx !== 3 && s.pisteGardiens[3 * 4 + 0] > 0) {
              fireTrigger(counters, 4);
            }
            if (checkGardienWinCondition(s, variant)) {
              return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
            }
          }
        } else if (tileId <= 25) {
          // RÊVE R1..R10
          s.tuilesLisiere[idx + 1] = 1;
          insertDreamAtRank6(s, tileId);
          counters.tileBuiltCounts[tileId]++;
          counters.tileBuiltTurnSum[tileId] += turn;
          fireTrigger(counters, 5);
          notes.push(`Pose R${tileId - 15} (Rang 6)`);
        } else {
          // CROISSANCE M1..M5 (Nid)
          const pos = findNidParcel(s, topology, l);
          if (pos) {
            s.tuilesLisiere[idx + 1] = 1;
            s.tuilesLisiere[idx + 2] = 0; // 2 Defenders move onto Nid parcel!
            s.forets[(pos.ray * 6 + pos.p) * 4 + 3] = tileId;
            s.parcelUnits[(pos.ray * 6 + pos.p) * 2 + 0] += defCount;
            counters.tileBuiltCounts[tileId]++;
            counters.tileBuiltTurnSum[tileId] += turn;
            fireTrigger(counters, 6);
            notes.push(`Nid M${tileId - 25} en R${pos.ray + 1}P${pos.p + 1}`);
          }
        }
      }
    }
  }

  // 3.2: Ouverture simultanée des mini-paravents
  for (let pl = 0; pl < N; pl++) {
    const tBase = pl * 4;
    const card = s.tiragesSecrets[tBase + 0];
    let dieM = s.tiragesSecrets[tBase + 1];

    if (card === 99) {
      // Sabotage drawn -> returns to general reserve (leaves deck)
      s.meta[10]++;
      notes.push('Sabotage pioché');
      continue;
    }

    // Check Bug du Cerveau Hook_Bug_Etape_3_2 (hook 0)
    const bugSlot = variant.slotsByNumericId[31];
    if (bugSlot && bugSlot.insectHook === 0) {
      const rIdx = dieM - 1;
      const insOnRank = s.pisteTactiques[rIdx * 4 + 2] + s.pisteTactiques[rIdx * 4 + 3];
      if (insOnRank > 0) {
        // Shift reading toward nearest Dream if possible
        for (const inst of bugSlot.face1) {
          if (inst.primitiveId === 6 && inst.param2 !== 0) {
            dieM = Math.max(1, Math.min(6, dieM + inst.param2));
            if (bugSlot.insectConsumption === 0) {
              if (s.pisteTactiques[rIdx * 4 + 2] > 0) s.pisteTactiques[rIdx * 4 + 2]--;
              else s.pisteTactiques[rIdx * 4 + 3]--;
            }
          }
        }
      }
    }

    const rankIdx = dieM - 1;
    const rankTileId = s.pisteTactiques[rankIdx * 4 + 0];
    if (rankTileId >= 16) {
      // RÊVE cancels machine attack and executes its continuous Slot!
      const rSlot = variant.slotsByNumericId[rankTileId];
      counters.tileActivations[rankTileId]++;
      if (rSlot) {
        for (const inst of rSlot.face1) {
          executeInstruction(s, inst, counters, { dreamRankIdx: rankIdx, activeDieM: dieM });
        }
      }
      fireTrigger(counters, 5);
      notes.push(`Rêve R${rankTileId - 15} annule M`);
      if (checkDreamWinCondition(s)) {
        return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
      }
    } else {
      // Machine + Tactique T1..T6 becomes active
      const ray = Math.floor(card / 2);
      const mType = card % 2;
      s.machines[(ray * 2 + mType) * 4 + 2] = rankTileId;
    }
  }

  resolveGardienCascades(s, variant, counters);
  if (s.meta[4] !== 0) {
    return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
  }

  // ==================== ÉTAPE 4 : FURTIVITÉ, NIDS & INSECTES ====================
  s.meta[3] = 4;
  // 4.1: Binomes en Furtivite (2 Def OR 1 Def + 1 Insect discarded)
  for (let l = 0; l < N; l++) {
    for (let p = 0; p < pMax; p++) {
      const lfIdx = (l * 6 + p) * 2;
      const defs = s.lisieresFurtivite[lfIdx + 0];
      const ins = s.lisieresFurtivite[lfIdx + 1];
      let activeBinome = false;
      if (defs >= 2) {
        activeBinome = true;
      } else if (defs >= 1 && ins >= 1) {
        activeBinome = true;
        s.lisieresFurtivite[lfIdx + 1] -= 1; // Discard the insect
      }
      if (!activeBinome) continue;

      const leftRay = l;
      const rightRay = (l + 1) % N;
      for (const ray of [leftRay, rightRay]) {
        const fIdx = (ray * 6 + p) * 4;
        const m0 = s.machines[(ray * 2 + 0) * 4 + 0];
        const m1 = s.machines[(ray * 2 + 1) * 4 + 0];
        const hasAnyMachine = m0 === p || m1 === p;

        // Check if parcel is targeted this turn by any active machine on this ray
        let isTargeted = false;
        let hasActiveMachineHere = false;
        for (let mt = 0; mt < 2; mt++) {
          const mBase = (ray * 2 + mt) * 4;
          const mp = s.machines[mBase + 0];
          const tac = s.machines[mBase + 2];
          if (mp === p && tac > 0) hasActiveMachineHere = true;
          if (tac > 0) {
            if ((tac === 1 || tac === 4) && mp === p) isTargeted = true;
            if ((tac === 2 || tac === 5) && Math.min(pMax - 1, mp + 1) === p) isTargeted = true;
            if ((tac === 3 || tac === 6) && (mp === p || Math.min(pMax - 1, mp + 1) === p)) isTargeted = true;
          }
        }

        if (!hasAnyMachine && !isTargeted && s.forets[fIdx + 2] === 0) {
          s.forets[fIdx + 2] = 1; // Piege
          counters.trapsPlaced++;
          fireTrigger(counters, 2);
        } else if (hasAnyMachine && !hasActiveMachineHere) {
          s.meta[9] += 1; // Sabotage added to side pile
          counters.sabotagesGained++;
          fireTrigger(counters, 3);
        }
      }
    }
  }

  // 4.2: Activation des Nids de Croissance
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      const fIdx = (r * 6 + p) * 4;
      const nidId = s.forets[fIdx + 3];
      if (nidId > 0 && s.parcelUnits[(r * 6 + p) * 2 + 0] >= 1) {
        const curIns = s.parcelUnits[(r * 6 + p) * 2 + 1];
        let spawn = 1;
        for (const th of variant.chassis.Courbe_Croissance_Nid) {
          if (curIns >= th.minInsects && curIns <= th.maxInsects) {
            spawn = th.spawn;
            break;
          }
        }
        s.parcelUnits[(r * 6 + p) * 2 + 1] += spawn;
        counters.nidsActivated++;
        counters.tileActivations[nidId]++;
        fireTrigger(counters, 6);

        const mSlot = variant.slotsByNumericId[nidId];
        if (mSlot) {
          for (const inst of mSlot.face1) {
            executeInstruction(s, inst, counters, { nidRay: r, nidP: p });
          }
        }
      }
    }
  }

  // 4.3: Mouvement & Migration P_max des Insectes
  // Move insects on P_max onto Bug du Cerveau or Colonisation des Gardiens, or move 1 step inward
  for (let r = 0; r < N; r++) {
    for (let p = pMax - 1; p >= 0; p--) {
      const puIdx = (r * 6 + p) * 2;
      const insCount = s.parcelUnits[puIdx + 1];
      if (insCount <= 0) continue;

      if (p === pMax - 1) {
        // Migrate from P_max to global tracks
        // Leave 1 if parcel is directly threatened by machine, migrate the rest
        const toMigrate = insCount;
        s.parcelUnits[puIdx + 1] = 0;
        counters.insectsMigrated += toMigrate;
        for (let k = 0; k < toMigrate; k++) {
          // Alternate between Bug du Cerveau (leading tactic) and Colonisation (first occupied Gardien)
          let colSlotIdx = -1;
          for (let d = 0; d < 6; d++) {
            if (s.pisteGardiens[d * 4 + 0] > 0) {
              colSlotIdx = d;
              break;
            }
          }
          if (k % 2 === 0 && colSlotIdx >= 0) {
            s.pisteGardiens[colSlotIdx * 4 + 3] += 1;
            const colSlot = variant.slotsByNumericId[32];
            if (colSlot && colSlot.insectHook === 1) {
              // Hook_Colonie_Etape_4_3
              for (const inst of colSlot.face1) {
                executeInstruction(s, inst, counters, {});
              }
              if (colSlot.insectConsumption === 0) {
                s.pisteGardiens[colSlotIdx * 4 + 3] = Math.max(0, s.pisteGardiens[colSlotIdx * 4 + 3] - 1);
              }
            }
          } else {
            // Bug du Cerveau on rank 0 or leading tactic rank
            const targetRank = 0;
            const bugSlot = variant.slotsByNumericId[31];
            if (bugSlot && bugSlot.insectAttachment === 1) {
              s.pisteTactiques[targetRank * 4 + 3] += 1;
            } else {
              s.pisteTactiques[targetRank * 4 + 2] += 1;
            }
          }
        }
      } else if (s.machines[(r * 2 + 0) * 4 + 0] !== p && s.machines[(r * 2 + 1) * 4 + 0] !== p) {
        // Move 1 step toward center P_max
        s.parcelUnits[puIdx + 1] -= 1;
        s.parcelUnits[(r * 6 + (p + 1)) * 2 + 1] += 1;
      }
    }
  }

  resolveGardienCascades(s, variant, counters);
  if (s.meta[4] !== 0) {
    return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
  }

  // ==================== ÉTAPE 5 : ATTAQUES DES MACHINES ====================
  s.meta[3] = 5;
  const damagedMask = new Uint8Array(N * 6); // ray * 6 + p -> 1 if lost >= 1 tree/stump
  const tacticDamagedCount = new Int8Array(12); // per machine card (ray*2 + mType)
  const tacticPowerGain = new Int8Array(12);
  const trapsTriggered = new Uint8Array(N * 6);
  const attackedParcels = new Uint8Array(N * 6);

  // Strict resolution order: 1. Abatteuses (mType=0) -> 2. Bulldozers (mType=1)
  for (const mType of [0, 1]) {
    for (let r = 0; r < N; r++) {
      const mBase = (r * 2 + mType) * 4;
      const tac = s.machines[mBase + 2];
      if (tac === 0) continue;

      const mp = s.machines[mBase + 0];
      const mPow = s.machines[mBase + 1];
      const mod = tacticMod(tac);

      // Determine targeted parcels honoring Comportement_Bout_Rayon at P_max
      const targets: { ray: number; p: number }[] = [];
      if (tac === 1 || tac === 4) {
        targets.push({ ray: r, p: mp });
      } else if (tac === 2 || tac === 5) {
        if (mp < pMax - 1) {
          targets.push({ ray: r, p: mp + 1 });
        } else {
          // Machine at P_max playing T2/T5
          const bRule = variant.chassis.Comportement_Bout_Rayon;
          if (bRule === 'FRAPPE_SUR_PLACE') targets.push({ ray: r, p: mp });
          else if (bRule === 'BOUCLE_VOISIN') targets.push({ ray: (r + 1) % N, p: pMax - 1 });
          else if (bRule === 'DEGAT_COEUR') {
            const adjR = (r + 1) % N;
            const adjF = (adjR * 6 + (pMax - 1)) * 4;
            if (s.forets[adjF + 0] > 0) {
              s.forets[adjF + 0]--;
              s.forets[adjF + 1]++;
            }
          }
          // FRAPPE_A_VIDE_AVANT -> no target
        }
      } else {
        // T3 / T6
        if (mp < pMax - 1) {
          targets.push({ ray: r, p: mp });
          targets.push({ ray: r, p: mp + 1 });
        } else {
          const bRule = variant.chassis.Comportement_Bout_Rayon;
          if (bRule === 'FRAPPE_SUR_PLACE') {
            targets.push({ ray: r, p: mp });
            targets.push({ ray: r, p: mp });
          } else if (bRule === 'FRAPPE_A_VIDE_AVANT') {
            targets.push({ ray: r, p: mp });
          } else if (bRule === 'BOUCLE_VOISIN') {
            targets.push({ ray: r, p: mp });
            targets.push({ ray: (r + 1) % N, p: pMax - 1 });
          } else if (bRule === 'DEGAT_COEUR') {
            targets.push({ ray: r, p: mp });
            const adjR = (r + 1) % N;
            const adjF = (adjR * 6 + (pMax - 1)) * 4;
            if (s.forets[adjF + 0] > 0) {
              s.forets[adjF + 0]--;
              s.forets[adjF + 1]++;
            }
          }
        }
      }

      // Bug du Cerveau Hook_Bug_Etape_5 (hook 2) on the rank of this tactic
      let bugSeuilMod = 0;
      const bugSlot = variant.slotsByNumericId[31];
      if (bugSlot && bugSlot.insectHook === 2) {
        for (let rk = 0; rk < 6; rk++) {
          if (s.pisteTactiques[rk * 4 + 0] === tac) {
            const insCnt = s.pisteTactiques[rk * 4 + 2] + s.pisteTactiques[rk * 4 + 3];
            if (insCnt > 0) {
              for (const inst of bugSlot.face1) {
                if (inst.primitiveId === 1) bugSeuilMod += inst.param1 * insCnt;
                if (inst.primitiveId === 4 && inst.param2 === 1) s.machines[mBase + 3] = 1;
              }
              if (bugSlot.insectConsumption === 0) {
                if (s.pisteTactiques[rk * 4 + 2] > 0) s.pisteTactiques[rk * 4 + 2]--;
                else if (s.pisteTactiques[rk * 4 + 3] > 0) s.pisteTactiques[rk * 4 + 3]--;
              }
            }
          }
        }
      }

      const uniqueDamagedThisMachine = new Set<number>();

      for (const tgt of targets) {
        const fIdx = (tgt.ray * 6 + tgt.p) * 4;
        const puIdx = (tgt.ray * 6 + tgt.p) * 2;
        const trees = s.forets[fIdx + 0];
        const stumps = s.forets[fIdx + 1];
        if (trees + stumps === 0) continue; // Razed parcel: strikes empty air

        attackedParcels[tgt.ray * 6 + tgt.p] = 1;
        const hasTrap = s.forets[fIdx + 2] === 1;
        const autoParade = s.parcelMods[puIdx + 1] === 1;
        const slotRed = s.parcelMods[puIdx + 0];
        const seuil = Math.max(1, trees + stumps + mPow + mod - slotRed - bugSeuilMod);
        if (slotRed > 0 || bugSeuilMod > 0) s.meta[6]++;

        const defense = s.parcelUnits[puIdx + 0] + s.parcelUnits[puIdx + 1];

        if (hasTrap || autoParade || defense >= seuil) {
          // PARÉ !
          if (hasTrap) trapsTriggered[tgt.ray * 6 + tgt.p] = 1;
          counters.paradesSucceeded++;
          fireTrigger(counters, 1);
        } else {
          // HIT!
          if (mType === 0) {
            // Abatteuse turns 1 standing tree into 1 stump
            if (s.forets[fIdx + 0] > 0) {
              s.forets[fIdx + 0] -= 1;
              s.forets[fIdx + 1] += 1;
              damagedMask[tgt.ray * 6 + tgt.p] = 1;
              uniqueDamagedThisMachine.add(tgt.ray * 6 + tgt.p);
            }
          } else {
            // Bulldozer clears ALL stumps (including freshly cut ones!)
            if (s.forets[fIdx + 1] > 0) {
              s.forets[fIdx + 1] = 0;
              damagedMask[tgt.ray * 6 + tgt.p] = 1;
              uniqueDamagedThisMachine.add(tgt.ray * 6 + tgt.p);
            }
          }
        }
      }

      tacticDamagedCount[r * 2 + mType] = uniqueDamagedThisMachine.size;
    }
  }

  // 5.3: Finalisation des machines
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      // Remove triggered traps
      if (trapsTriggered[r * 6 + p] === 1) {
        s.forets[(r * 6 + p) * 4 + 2] = 0;
      }
      // Remove Insects that participated in a Parade on an attacked parcel (page 10)
      if (attackedParcels[r * 6 + p] === 1 && s.parcelUnits[(r * 6 + p) * 2 + 1] > 0) {
        s.parcelUnits[(r * 6 + p) * 2 + 1] = 0;
      }
    }

    for (let mType = 0; mType < 2; mType++) {
      const mBase = (r * 2 + mType) * 4;
      const tac = s.machines[mBase + 2];
      if (tac === 0) continue;

      // Advance T3 / T6
      if ((tac === 3 || tac === 6) && s.machines[mBase + 0] < pMax - 1) {
        s.machines[mBase + 0] += 1;
        const np = s.machines[mBase + 0];
        const fIdx = (r * 6 + np) * 4;
        // Nid Destruction if machine enters parcel with Nid (page 10)
        if (s.forets[fIdx + 3] > 0) {
          const nidId = s.forets[fIdx + 3];
          s.forets[fIdx + 3] = 0;
          s.parcelUnits[(r * 6 + np) * 2 + 1] = 0;
          markLisiereTileStatus(s, nidId, 0);
          notes.push(`Nid M${nidId - 25} détruit`);
        }
      }

      // +1 Puissance permanent for T4, T5, T6 (unless blocked)
      if ((tac === 4 || tac === 5 || tac === 6) && s.machines[mBase + 3] === 0) {
        s.machines[mBase + 1] = Math.min(8, s.machines[mBase + 1] + 1);
        tacticPowerGain[r * 2 + mType] = 1;
      }
    }
  }

  resolveGardienCascades(s, variant, counters);
  if (s.meta[4] !== 0) {
    return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
  }

  // ==================== ÉTAPE 6 : APPRENTISSAGE & RESET ====================
  s.meta[3] = 6;
  // 6.1: Learning tokens
  for (let rk = 0; rk < 6; rk++) s.pisteTactiques[rk * 4 + 1] = 0;

  for (let r = 0; r < N; r++) {
    for (let mType = 0; mType < 2; mType++) {
      const mBase = (r * 2 + mType) * 4;
      const tac = s.machines[mBase + 2];
      if (tac === 0) continue;
      const gain = tacticDamagedCount[r * 2 + mType] + tacticPowerGain[r * 2 + mType];
      if (gain > 0) {
        for (let rk = 0; rk < 6; rk++) {
          if (s.pisteTactiques[rk * 4 + 0] === tac) {
            s.pisteTactiques[rk * 4 + 1] += gain;
            break;
          }
        }
      }
    }
  }

  // Hook_Bug_Etape_6 (hook 3)
  const bugSlot6 = variant.slotsByNumericId[31];
  if (bugSlot6 && bugSlot6.insectHook === 3) {
    for (let rk = 0; rk < 6; rk++) {
      const insCnt = s.pisteTactiques[rk * 4 + 2] + s.pisteTactiques[rk * 4 + 3];
      if (insCnt > 0) {
        const tid = s.pisteTactiques[rk * 4 + 0];
        if (tid <= 6 && s.pisteTactiques[rk * 4 + 1] > 0) {
          s.pisteTactiques[rk * 4 + 1] = Math.max(0, s.pisteTactiques[rk * 4 + 1] - insCnt);
          if (bugSlot6.insectConsumption === 0) {
            if (s.pisteTactiques[rk * 4 + 2] > 0) s.pisteTactiques[rk * 4 + 2]--;
            else s.pisteTactiques[rk * 4 + 3]--;
          }
        }
      }
    }
  }

  // 6.2: Strict unique leader swaps left (r -> r-1)
  let maxTok = 0;
  let leaderRank = -1;
  let tie = false;
  for (let rk = 0; rk < 6; rk++) {
    const tid = s.pisteTactiques[rk * 4 + 0];
    if (tid > 6) continue;
    const tok = s.pisteTactiques[rk * 4 + 1];
    if (tok > maxTok) {
      maxTok = tok;
      leaderRank = rk;
      tie = false;
    } else if (tok === maxTok && tok > 0) {
      tie = true;
    }
  }

  if (leaderRank > 0 && !tie && maxTok > 0) {
    const left = leaderRank - 1;
    for (let f = 0; f < 4; f++) {
      const tmp = s.pisteTactiques[leaderRank * 4 + f];
      s.pisteTactiques[leaderRank * 4 + f] = s.pisteTactiques[left * 4 + f];
      s.pisteTactiques[left * 4 + f] = tmp;
    }
    notes.push(`T${s.pisteTactiques[left * 4 + 0]} avance R${leaderRank + 1}->R${left + 1}`);
  }
  for (let rk = 0; rk < 6; rk++) s.pisteTactiques[rk * 4 + 1] = 0;

  if (checkDreamWinCondition(s)) {
    return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
  }

  // 6.3: Recover defenders & single unified Machine+Sabotage deck shuffle
  s.parcelUnits.forEach((_, i) => {
    if (i % 2 === 0) s.parcelUnits[i] = 0; // clear defenders, keep insects
  });
  for (let i = 0; i < s.lisieresFurtivite.length; i += 2) {
    s.lisieresFurtivite[i] = 0; // clear defenders, keep insects
  }
  for (let i = 0; i < s.tuilesLisiere.length; i += 3) {
    s.tuilesLisiere[i + 2] = 0;
  }

  // Rebuild unified deck: 2N machines + accumulated un-drawn sabotages + newly gained sabotages
  let newDeckIdx = 0;
  for (let i = 0; i < 2 * N; i++) {
    s.paquetMachines[newDeckIdx++] = i;
  }
  // Keep un-drawn sabotages remaining in deck + sidePileSabotages
  let carrySabotages = s.meta[9];
  for (let i = 0; i < s.meta[8]; i++) {
    if (s.paquetMachines[i] === 99) carrySabotages++;
  }
  const maxDeck = Math.min(32, newDeckIdx + carrySabotages);
  while (newDeckIdx < maxDeck) {
    s.paquetMachines[newDeckIdx++] = 99;
  }
  s.meta[8] = newDeckIdx;
  s.meta[9] = 0;
  shuffleDeck(s.paquetMachines, s.meta[8], s.rngState);

  if (turn >= 8) {
    s.meta[4] = 1; // TOUR_8
  } else {
    s.meta[2] = turn + 1;
  }

  return { revisions: step2Res.revisionsCount, turnSummary: notes.join(' · ') };
}

function applyFinalRepousse(s: GameState): void {
  const N = s.meta[0];
  const pMax = s.meta[1];
  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      const fIdx = (r * 6 + p) * 4;
      if (s.forets[fIdx + 1] >= 1) {
        s.forets[fIdx + 1] -= 1;
        s.forets[fIdx + 0] += 1;
      }
    }
  }
}

export function continueFromClonedState(
  clonedState: GameState,
  topology: TopologyConfig,
  variant: CompiledVariant,
  profile: BotProfile,
  firstTurnOverride: ForkOverrideMode,
): number {
  const counters = createTurnCounters();
  const s = clonedState;
  const N = s.meta[0];
  const pMax = s.meta[1];
  let first = true;

  while (s.meta[4] === 0 && s.meta[2] <= 8) {
    if (first) {
      // Cloned at start of Step 2 of current turn
      first = false;
      const turn = s.meta[2];
      // Finish Step 2..6 with override
      resolveStep2Defenders(s, variant, profile, firstTurnOverride);
      // Run remainder of turn by executing Steps 3..6 directly via a clean helper:
      finishTurnFromStep3(s, topology, variant, profile, counters);
      if (s.meta[4] !== 0) break;
      if (turn >= 8) {
        s.meta[4] = 1;
        break;
      }
      s.meta[2] = turn + 1;
    } else {
      runTurn(s, topology, variant, profile, counters, 'NORMAL');
    }
  }

  applyFinalRepousse(s);
  const initialTrees = 3 * N * pMax;
  return (countStandingTrees(s) / initialTrees) * 100;
}

function finishTurnFromStep3(
  s: GameState,
  topology: TopologyConfig,
  variant: CompiledVariant,
  profile: BotProfile,
  counters: TurnCounters,
): void {
  // Reuse step 3..6 logic by running a lightweight partial step starting after Step 2
  // For clean consistency, simulate remaining steps identically to runTurn:
  const N = s.meta[0];
  const pMax = s.meta[1];
  const turn = s.meta[2];

  // Step 3.1
  for (let l = 0; l < N; l++) {
    for (let sl = 0; sl < 2; sl++) {
      const idx = (l * 2 + sl) * 3;
      const tileId = s.tuilesLisiere[idx + 0];
      const status = s.tuilesLisiere[idx + 1];
      const defCount = s.tuilesLisiere[idx + 2];
      if (status === 0 && defCount >= 2) {
        if (tileId <= 15) {
          const slot = variant.slotsByNumericId[tileId];
          const trigIdx = pickGardienTriggerSlot(s, slot?.triggerAffinity ?? 0);
          if (trigIdx >= 0) {
            s.tuilesLisiere[idx + 1] = 1;
            s.pisteGardiens[trigIdx * 4 + 0] = tileId;
            s.pisteGardiens[trigIdx * 4 + 1] = 1;
            if (trigIdx !== 3 && s.pisteGardiens[3 * 4 + 0] > 0) fireTrigger(counters, 4);
            if (checkGardienWinCondition(s, variant)) return;
          }
        } else if (tileId <= 25) {
          s.tuilesLisiere[idx + 1] = 1;
          insertDreamAtRank6(s, tileId);
          fireTrigger(counters, 5);
        } else {
          const pos = findNidParcel(s, topology, l);
          if (pos) {
            s.tuilesLisiere[idx + 1] = 1;
            s.tuilesLisiere[idx + 2] = 0;
            s.forets[(pos.ray * 6 + pos.p) * 4 + 3] = tileId;
            s.parcelUnits[(pos.ray * 6 + pos.p) * 2 + 0] += defCount;
            fireTrigger(counters, 6);
          }
        }
      }
    }
  }

  // Step 3.2
  for (let pl = 0; pl < N; pl++) {
    const tBase = pl * 4;
    const card = s.tiragesSecrets[tBase + 0];
    const dieM = s.tiragesSecrets[tBase + 1];
    if (card === 99) continue;
    const rankIdx = dieM - 1;
    const rankTileId = s.pisteTactiques[rankIdx * 4 + 0];
    if (rankTileId >= 16) {
      const rSlot = variant.slotsByNumericId[rankTileId];
      if (rSlot) {
        for (const inst of rSlot.face1) {
          executeInstruction(s, inst, counters, { dreamRankIdx: rankIdx, activeDieM: dieM });
        }
      }
      fireTrigger(counters, 5);
      if (checkDreamWinCondition(s)) return;
    } else {
      const ray = Math.floor(card / 2);
      const mType = card % 2;
      s.machines[(ray * 2 + mType) * 4 + 2] = rankTileId;
    }
  }
  resolveGardienCascades(s, variant, counters);
  if (s.meta[4] !== 0) return;

  // Step 4.1..4.3
  for (let l = 0; l < N; l++) {
    for (let p = 0; p < pMax; p++) {
      const lfIdx = (l * 6 + p) * 2;
      if (s.lisieresFurtivite[lfIdx + 0] >= 2 || (s.lisieresFurtivite[lfIdx + 0] >= 1 && s.lisieresFurtivite[lfIdx + 1] >= 1)) {
        if (s.lisieresFurtivite[lfIdx + 0] === 1) s.lisieresFurtivite[lfIdx + 1]--;
        for (const ray of [l, (l + 1) % N]) {
          const fIdx = (ray * 6 + p) * 4;
          const hasM = s.machines[(ray * 2) * 4 + 0] === p || s.machines[(ray * 2 + 1) * 4 + 0] === p;
          if (!hasM && s.forets[fIdx + 2] === 0) {
            s.forets[fIdx + 2] = 1;
            fireTrigger(counters, 2);
          } else if (hasM) {
            s.meta[9] += 1;
            fireTrigger(counters, 3);
          }
        }
      }
    }
  }

  for (let r = 0; r < N; r++) {
    for (let p = 0; p < pMax; p++) {
      const fIdx = (r * 6 + p) * 4;
      const nidId = s.forets[fIdx + 3];
      if (nidId > 0 && s.parcelUnits[(r * 6 + p) * 2 + 0] >= 1) {
        s.parcelUnits[(r * 6 + p) * 2 + 1] += 1;
        fireTrigger(counters, 6);
      }
    }
  }

  // Step 5 simplified identical resolution
  for (const mType of [0, 1]) {
    for (let r = 0; r < N; r++) {
      const mBase = (r * 2 + mType) * 4;
      const tac = s.machines[mBase + 2];
      if (tac === 0) continue;
      const mp = s.machines[mBase + 0];
      const tp = tac === 2 || tac === 5 ? Math.min(pMax - 1, mp + 1) : mp;
      const fIdx = (r * 6 + tp) * 4;
      if (s.forets[fIdx + 0] + s.forets[fIdx + 1] === 0) continue;
      const seuil = Math.max(1, s.forets[fIdx + 0] + s.forets[fIdx + 1] + s.machines[mBase + 1] + tacticMod(tac) - s.parcelMods[(r * 6 + tp) * 2 + 0]);
      const def = s.parcelUnits[(r * 6 + tp) * 2 + 0] + s.parcelUnits[(r * 6 + tp) * 2 + 1];
      if (s.forets[fIdx + 2] === 1 || s.parcelMods[(r * 6 + tp) * 2 + 1] === 1 || def >= seuil) {
        s.forets[fIdx + 2] = 0;
        fireTrigger(counters, 1);
      } else if (mType === 0 && s.forets[fIdx + 0] > 0) {
        s.forets[fIdx + 0]--;
        s.forets[fIdx + 1]++;
      } else if (mType === 1) {
        s.forets[fIdx + 1] = 0;
      }
      if ((tac === 3 || tac === 6) && s.machines[mBase + 0] < pMax - 1) s.machines[mBase + 0]++;
      if (tac >= 4 && s.machines[mBase + 3] === 0) s.machines[mBase + 1] = Math.min(8, s.machines[mBase + 1] + 1);
    }
  }
  resolveGardienCascades(s, variant, counters);

  // Step 6 cleanup
  for (let i = 0; i < s.parcelUnits.length; i += 2) s.parcelUnits[i] = 0;
  for (let i = 0; i < s.lisieresFurtivite.length; i += 2) s.lisieresFurtivite[i] = 0;
  for (let i = 0; i < s.tuilesLisiere.length; i += 3) s.tuilesLisiere[i + 2] = 0;
  let ndi = 0;
  for (let i = 0; i < 2 * N; i++) s.paquetMachines[ndi++] = i;
  let csab = s.meta[9];
  while (ndi < Math.min(32, 2 * N + csab)) s.paquetMachines[ndi++] = 99;
  s.meta[8] = ndi;
  s.meta[9] = 0;
  shuffleDeck(s.paquetMachines, s.meta[8], s.rngState);
  void turn;
  void profile;
}

export function simulateSingleGame(
  topology: TopologyConfig,
  variant: CompiledVariant,
  profile: BotProfile,
  seed: number,
  options?: {
    recordTrace?: boolean;
    forkCaptureTurn?: number;
  },
): { result: SingleGameOutput; capturedForkState?: GameState } {
  const pMax = variant.chassis.P_Max;
  const s = initGameState(topology, pMax, seed);
  const counters = createTurnCounters();
  const initialTrees = 3 * topology.N * pMax;
  const totalParcels = topology.N * pMax;

  let revisionsStep2 = 0;
  const erosionByTurn: { treesPct: number; stumpsPct: number; razedPct: number }[] = [];
  const traceSteps: NarrativeStepLog[] = [];
  let capturedForkState: GameState | undefined;

  while (s.meta[4] === 0 && s.meta[2] <= 8) {
    const currentTurn = s.meta[2];

    if (options?.forkCaptureTurn === currentTurn && !capturedForkState) {
      // Run Step 1 first, then snapshot right before Step 2
      s.meta[3] = 1;
      for (let d = 0; d < 6; d++) s.pisteGardiens[d * 4 + 2] = 0;
      s.parcelMods.fill(0);
      for (let r = 0; r < topology.N; r++) {
        for (let m = 0; m < 2; m++) {
          s.machines[(r * 2 + m) * 4 + 2] = 0;
          s.machines[(r * 2 + m) * 4 + 3] = 0;
        }
      }
      for (let pl = 0; pl < topology.N; pl++) {
        const card = s.meta[8] > 0 ? s.paquetMachines[--s.meta[8]] : 99;
        const d1 = rollDie6(s.rngState);
        const d2 = rollDie6(s.rngState);
        const dieM = d1 < d2 ? d1 : d2;
        const rankTile = s.pisteTactiques[(dieM - 1) * 4 + 0];
        const tBase = pl * 4;
        s.tiragesSecrets[tBase + 0] = card;
        s.tiragesSecrets[tBase + 1] = dieM;
        s.tiragesSecrets[tBase + 2] = 0;
        s.tiragesSecrets[tBase + 3] = card === 99 || rankTile >= 16 ? 0 : rankTile;
      }
      capturedForkState = cloneGameState(s);
      // Now continue this turn normally
      resolveStep2Defenders(s, variant, profile, 'NORMAL');
      finishTurnFromStep3(s, topology, variant, profile, counters);
      if (s.meta[4] === 0) {
        if (currentTurn >= 8) s.meta[4] = 1;
        else s.meta[2] = currentTurn + 1;
      }
    } else {
      const turnRes = runTurn(s, topology, variant, profile, counters, 'NORMAL');
      revisionsStep2 += turnRes.revisions;

      const tCount = countStandingTrees(s);
      const sCount = countStumps(s);
      const rCount = countRazedParcels(s);
      erosionByTurn.push({
        treesPct: (tCount / initialTrees) * 100,
        stumpsPct: (sCount / initialTrees) * 100,
        razedPct: (rCount / totalParcels) * 100,
      });

      if (options?.recordTrace) {
        traceSteps.push({
          tour: currentTurn,
          resume: turnRes.turnSummary || 'Défense standard & échanges tactiques.',
          arbresDebout: tCount,
          souches: sCount,
          parcellesRasees: rCount,
          gardiensPoses: countActiveGardiens(s),
          revePlusAvance: getMostAdvancedDreamRank(s),
        });
      }
    }
  }

  const finalTurn = Math.min(8, s.meta[2]);
  const endCondition = END_CODE_MAP[s.meta[4]] ?? 'TOUR_8';

  // Tension gap before regrowth
  const activeG = countActiveGardiens(s);
  const dreamRank = getMostAdvancedDreamRank(s);
  const tensionGap =
    endCondition === 'TOUR_8'
      ? Math.min(topology.N - activeG, dreamRank > 0 ? dreamRank - 1 : 5)
      : 0;

  // Apply final Repousse (1 stump -> 1 standing tree per parcel)
  applyFinalRepousse(s);

  const finalTrees = countStandingTrees(s);
  const scoreRatio = (finalTrees / initialTrees) * 100;
  const razedParcelsPct = (countRazedParcels(s) / totalParcels) * 100;

  const trace: NarrativeTrace | undefined = options?.recordTrace
    ? {
        kind: 'PARTIE_MEDIANE',
        topologyDesc: `${topology.N}J (${topology.peoples.join('–')})`,
        endCondition,
        finalTurn,
        initialTrees,
        finalTrees,
        scoreRatio: Number(scoreRatio.toFixed(1)),
        steps: traceSteps,
      }
    : undefined;

  return {
    result: {
      endCondition,
      finalTurn,
      initialTrees,
      finalTrees,
      scoreRatio,
      razedParcelsPct,
      tensionGap,
      revisionsStep2,
      cascadesPerTurn: counters.cascadesThisTurn / Math.max(1, finalTurn),
      manipulationsPerTurn: counters.manipulationsThisTurn / Math.max(1, finalTurn),
      paradeModStackMean: s.meta[6] / Math.max(1, finalTurn),
      counters,
      erosionByTurn,
      trace,
    },
    capturedForkState,
  };
}
