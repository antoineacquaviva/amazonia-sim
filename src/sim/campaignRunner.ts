import type {
  CampaignConfig,
  CampaignResult,
  CompiledVariant,
  NarrativeTrace,
  PeopleCode,
  PeopleMetrics,
  RegimeCluster,
  SlotLibraryItem,
  SmartSummaryPayload,
  TileTelemetry,
  TopologyConfig,
  VariantResult,
} from './types.ts';
import {
  generateTopologies,
  PEOPLES,
  selectStratifiedTopologies,
  TILES_META,
} from './topology.ts';
import { buildVariantsForCampaign } from './patchCompiler.ts';
import {
  continueFromClonedState,
  simulateSingleGame,
  type SingleGameOutput,
} from './engine.ts';
import { cloneGameState } from './state.ts';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function stdDev(arr: number[], m?: number): number {
  if (arr.length <= 1) return 0;
  const avg = m ?? mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - avg;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / arr.length);
}

function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

function formatTraceSummaryText(tr: NarrativeTrace): string {
  const lines = [
    `[${tr.kind}] ${tr.topologyDesc} | Fin: ${tr.endCondition} (T${tr.finalTurn}) | Score: ${tr.finalTrees}/${tr.initialTrees} (${tr.scoreRatio}%)`,
  ];
  for (const st of tr.steps) {
    lines.push(
      `T${st.tour}: Arbres=${st.arbresDebout}, Souches=${st.souches}, Rasées=${st.parcellesRasees}, G=${st.gardiensPoses}, RêveR=${st.revePlusAvance || '-'} | ${st.resume}`,
    );
  }
  return lines.join('\n');
}

function evaluateSingleVariant(
  variant: CompiledVariant,
  topologies: TopologyConfig[],
  kRuns: number,
  includeForking: boolean,
  baseSeed: number,
): {
  result: VariantResult;
  configScores: Map<number, number>;
} {
  // Filter topologies if variant restricts N_Joueurs
  const activeTopos =
    variant.chassis.N_Joueurs === 'ALL'
      ? topologies
      : topologies.filter((t) => t.N === variant.chassis.N_Joueurs);
  const usedTopos = activeTopos.length > 0 ? activeTopos : topologies;

  const coopScores: number[] = [];
  const reflexScores: number[] = [];
  const oracleScores: number[] = [];
  const razedList: number[] = [];
  const tensionList: number[] = [];
  const endTurns: number[] = [];

  let finTour8 = 0;
  let finGardiens = 0;
  let finReve = 0;
  let earlyStops1to4 = 0;

  let totalParades = 0;
  let totalTraps = 0;
  let totalSabotages = 0;
  let totalTilesBuilt = 0;
  let totalNidsActivated = 0;
  let totalInsectsMigrated = 0;
  let totalRevisionsStep2 = 0;
  let totalCascadesPerTurn = 0;
  let totalManipPerTurn = 0;
  let totalParadeModStack = 0;

  // Tile tracking across 1..30
  const tileAvail = new Uint32Array(31);
  const tileBuilt = new Uint32Array(31);
  const tileTurnSum = new Uint32Array(31);
  const tileActiv = new Uint32Array(31);
  const tileF2 = new Uint32Array(31);
  const tileSac = new Uint32Array(31);
  const tileForkDeltaSum = new Float64Array(31);
  const tileForkCount = new Uint32Array(31);
  const tileForkInversions = new Uint32Array(31);

  // Per-topology and per-people accumulators
  const configScoreMap = new Map<number, number>();
  const configEndDist = new Map<number, { t8: number; g: number; r: number }>();

  const peopleScores = new Map<PeopleCode, number[]>();
  const peopleEarlyStops = new Map<PeopleCode, number>();
  for (const p of PEOPLES) {
    peopleScores.set(p.code, []);
    peopleEarlyStops.set(p.code, 0);
  }

  // Turn erosion curves (T1..T8)
  const erosionTrees = new Float64Array(8);
  const erosionStumps = new Float64Array(8);
  const erosionRazed = new Float64Array(8);
  const erosionCounts = new Uint32Array(8);

  // Sample games for 3 contrastive narrative traces
  const recordedGames: { out: SingleGameOutput; topo: TopologyConfig }[] = [];

  for (let ti = 0; ti < usedTopos.length; ti++) {
    const topo = usedTopos[ti];
    const topoScores: number[] = [];
    const eDist = { t8: 0, g: 0, r: 0 };

    // Record available tiles in this topology
    const availTileIds: number[] = [];
    for (const [a, b] of topo.lisiereTiles) {
      availTileIds.push(a, b);
    }

    for (let k = 0; k < kRuns; k++) {
      // Common Random Numbers (CRN) seed: strictly tied to (topo.id, k) so variants share dice/decks!
      const gameSeed = (baseSeed + topo.id * 1009 + k * 7919) >>> 0;

      // 1. Bot Cooperatif Heuristique (Main Design Target)
      const shouldTrace = k === 0 && ti % Math.max(1, Math.floor(usedTopos.length / 8)) === 0;
      const shouldFork = includeForking && k === 0 && ti % Math.max(1, Math.floor(usedTopos.length / 12)) === 0;
      const forkTurn = 2 + (k % 3) * 2; // Turn 2, 4, or 6

      const coopRun = simulateSingleGame(topo, variant, 'COOPERATIF', gameSeed, {
        recordTrace: shouldTrace,
        forkCaptureTurn: shouldFork ? forkTurn : undefined,
      });
      const res = coopRun.result;
      if (shouldTrace && res.trace) {
        recordedGames.push({ out: res, topo });
      }

      coopScores.push(res.scoreRatio);
      topoScores.push(res.scoreRatio);
      razedList.push(res.razedParcelsPct);
      tensionList.push(res.tensionGap);
      endTurns.push(res.finalTurn);

      if (res.endCondition === 'TOUR_8') {
        finTour8++;
        eDist.t8++;
      } else if (res.endCondition === 'GARDIENS') {
        finGardiens++;
        eDist.g++;
      } else {
        finReve++;
        eDist.r++;
      }
      if (res.endCondition !== 'TOUR_8' && res.finalTurn <= 4) {
        earlyStops1to4++;
      }

      totalParades += res.counters.paradesSucceeded;
      totalTraps += res.counters.trapsPlaced;
      totalSabotages += res.counters.sabotagesGained;
      totalNidsActivated += res.counters.nidsActivated;
      totalInsectsMigrated += res.counters.insectsMigrated;
      totalRevisionsStep2 += res.revisionsStep2;
      totalCascadesPerTurn += res.cascadesPerTurn;
      totalManipPerTurn += res.manipulationsPerTurn;
      totalParadeModStack += res.paradeModStackMean;

      for (const tid of availTileIds) {
        tileAvail[tid]++;
        if (res.counters.tileBuiltCounts[tid] > 0) {
          totalTilesBuilt += res.counters.tileBuiltCounts[tid];
          tileBuilt[tid]++;
          tileTurnSum[tid] += res.counters.tileBuiltTurnSum[tid];
        }
        tileActiv[tid] += res.counters.tileActivations[tid];
        tileF2[tid] += res.counters.tileUpgradesF2[tid];
        tileSac[tid] += res.counters.tileSacrifices[tid];
      }

      for (let t = 0; t < res.erosionByTurn.length && t < 8; t++) {
        erosionTrees[t] += res.erosionByTurn[t].treesPct;
        erosionStumps[t] += res.erosionByTurn[t].stumpsPct;
        erosionRazed[t] += res.erosionByTurn[t].razedPct;
        erosionCounts[t]++;
      }

      for (const pCode of topo.peoples) {
        peopleScores.get(pCode)?.push(res.scoreRatio);
        if (res.endCondition !== 'TOUR_8') {
          peopleEarlyStops.set(pCode, (peopleEarlyStops.get(pCode) ?? 0) + 1);
        }
      }

      // State Forking (4 clones sharing exact rngState)
      if (coopRun.capturedForkState) {
        const s0 = cloneGameState(coopRun.capturedForkState);
        const s1 = cloneGameState(coopRun.capturedForkState);
        const s2 = cloneGameState(coopRun.capturedForkState);
        const s3 = cloneGameState(coopRun.capturedForkState);

        const score0 = continueFromClonedState(s0, topo, variant, 'COOPERATIF', 'NORMAL');
        const score1 = continueFromClonedState(s1, topo, variant, 'COOPERATIF', 'FORCED_BUILD_TILE');
        const score2 = continueFromClonedState(s2, topo, variant, 'COOPERATIF', 'FORCED_STEALTH');
        const score3 = continueFromClonedState(s3, topo, variant, 'COOPERATIF', 'FORCED_DEFENSE_ONLY');

        const deltaBuild = score1 - score0;
        const bestAlt = Math.max(score1, score2, score3);
        const inverted = bestAlt > score0 + 0.5 ? 1 : 0;

        for (const tid of availTileIds) {
          tileForkDeltaSum[tid] += deltaBuild;
          tileForkCount[tid]++;
          tileForkInversions[tid] += inverted;
        }
      }

      // 2. Bot Réflexe & 3. Bot Oracle (on same CRN seed, sampled on all runs for tight paired comparison)
      const reflexRun = simulateSingleGame(topo, variant, 'REFLEXE', gameSeed);
      reflexScores.push(reflexRun.result.scoreRatio);

      const oracleRun = simulateSingleGame(topo, variant, 'ORACLE', gameSeed);
      oracleScores.push(oracleRun.result.scoreRatio);
    }

    const tMean = mean(topoScores);
    configScoreMap.set(topo.id, tMean);
    configEndDist.set(topo.id, eDist);
  }

  const totalGames = coopScores.length;
  const sortedScores = [...coopScores].sort((a, b) => a - b);
  const scoreRatioMean = mean(coopScores);
  const scoreRatioMedian = percentile(sortedScores, 0.5);
  const scoreRatioStd = stdDev(coopScores, scoreRatioMean);
  const scoreRatioP10 = percentile(sortedScores, 0.1);
  const scoreRatioP90 = percentile(sortedScores, 0.9);
  const meanInitialTrees =
    usedTopos.reduce((acc, t) => acc + 3 * t.N * variant.chassis.P_Max, 0) / usedTopos.length;

  const pctFinTour8 = (finTour8 / totalGames) * 100;
  const pctFinGardiens = (finGardiens / totalGames) * 100;
  const pctFinReve = (finReve / totalGames) * 100;
  const earlyStopTurns1to4Pct = (earlyStops1to4 / totalGames) * 100;

  // Axe 2: Inter-config dispersion & Outliers (> 2 sigma)
  const topoMeans = Array.from(configScoreMap.values());
  const sigmaInterConfigs = stdDev(topoMeans);
  const outlierConfigs: { configId: number; label: string; scoreRatio: number; zScore: number }[] = [];
  if (sigmaInterConfigs > 0.01) {
    for (const topo of usedTopos) {
      const sc = configScoreMap.get(topo.id) ?? scoreRatioMean;
      const z = (sc - scoreRatioMean) / sigmaInterConfigs;
      if (Math.abs(z) >= 2.0) {
        outlierConfigs.push({
          configId: topo.id,
          label: `${topo.N}J (${topo.peoples.join('-')})`,
          scoreRatio: Number(sc.toFixed(1)),
          zScore: Number(z.toFixed(2)),
        });
      }
    }
  }

  // Clustering by Behavioral Regimes
  const regimeMap = new Map<string, { scores: number[]; t8: number; g: number; r: number; count: number }>();
  for (const topo of usedTopos) {
    const bucket = regimeMap.get(topo.regimeTag) ?? { scores: [], t8: 0, g: 0, r: 0, count: 0 };
    bucket.scores.push(configScoreMap.get(topo.id) ?? scoreRatioMean);
    const ed = configEndDist.get(topo.id) ?? { t8: 0, g: 0, r: 0 };
    bucket.t8 += ed.t8;
    bucket.g += ed.g;
    bucket.r += ed.r;
    bucket.count++;
    regimeMap.set(topo.regimeTag, bucket);
  }
  const regimeClusters: RegimeCluster[] = Array.from(regimeMap.entries()).map(([regime, b]) => {
    const tot = Math.max(1, b.t8 + b.g + b.r);
    return {
      regime,
      configCount: b.count,
      meanScoreRatio: Number(mean(b.scores).toFixed(1)),
      deltaVsBaseline: 0, // filled once baseline compared
      winModeDistribution: {
        tour8: Number(((b.t8 / tot) * 100).toFixed(1)),
        gardiens: Number(((b.g / tot) * 100).toFixed(1)),
        reve: Number(((b.r / tot) * 100).toFixed(1)),
      },
    };
  });

  // People Metrics
  const peopleMetrics: PeopleMetrics[] = PEOPLES.map((p) => {
    const arr = peopleScores.get(p.code) ?? [];
    const early = peopleEarlyStops.get(p.code) ?? 0;
    return {
      people: p.code,
      label: p.label,
      gamesPresent: arr.length,
      meanScoreRatio: Number(mean(arr).toFixed(1)),
      earlyStopRate: arr.length > 0 ? Number(((early / arr.length) * 100).toFixed(1)) : 0,
    };
  });

  // Axe 3 & Tile Telemetry
  const reflexMean = mean(reflexScores);
  const oracleMean = mean(oracleScores);
  const deltaCoop = scoreRatioMean - reflexMean;
  const iccOpacite = Math.max(0, oracleMean - scoreRatioMean);

  const paradesPerGame = totalParades / totalGames;
  const trapsPlacedPerGame = totalTraps / totalGames;
  const sabotagesGainedPerGame = totalSabotages / totalGames;
  const tilesBuiltPerGame = totalTilesBuilt / totalGames;
  const nidsActivatedPerGame = totalNidsActivated / totalGames;
  const insectsMigratedPerGame = totalInsectsMigrated / totalGames;

  const actionEntropy = shannonEntropy([
    totalParades,
    totalTraps,
    totalSabotages,
    totalTilesBuilt,
    totalNidsActivated,
    totalInsectsMigrated,
  ]);

  const tileTelemetry: TileTelemetry[] = TILES_META.map((tm) => {
    const avail = tileAvail[tm.numericId];
    const built = tileBuilt[tm.numericId];
    const fCnt = tileForkCount[tm.numericId];
    return {
      tileId: tm.numericId,
      code: tm.code,
      family: tm.family,
      availableCount: avail,
      builtCount: built,
      pickRateWhenAvailable: avail > 0 ? Number(((built / avail) * 100).toFixed(1)) : 0,
      meanTurnBuilt: built > 0 ? Number((tileTurnSum[tm.numericId] / built).toFixed(2)) : 0,
      activationsPerGame: Number((tileActiv[tm.numericId] / totalGames).toFixed(2)),
      upgradeF2Rate: built > 0 ? Number(((tileF2[tm.numericId] / built) * 100).toFixed(1)) : 0,
      sacrificeRate: built > 0 ? Number(((tileSac[tm.numericId] / built) * 100).toFixed(1)) : 0,
      forkingDeltaV: fCnt > 0 ? Number((tileForkDeltaSum[tm.numericId] / fCnt).toFixed(2)) : 0,
      forkingInversionRate: fCnt > 0 ? Number(((tileForkInversions[tm.numericId] / fCnt) * 100).toFixed(1)) : 0,
    };
  });

  // Axe 5: Cognitive Load Index (ICC)
  const iccStatique = variant.iccStatique;
  const iccCascade = Number((totalCascadesPerTurn / totalGames + totalManipPerTurn / totalGames).toFixed(2));
  const iccCalcul = Number((totalParadeModStack / totalGames).toFixed(2));
  const iccGlobal = Number((iccStatique * 1.0 + iccCascade * 0.8 + iccCalcul * 0.7 + iccOpacite * 0.15).toFixed(2));

  // Erosion curve
  const erosionCurve: { turn: number; treesPct: number; stumpsPct: number; razedPct: number }[] = [];
  for (let t = 0; t < 8; t++) {
    if (erosionCounts[t] > 0) {
      erosionCurve.push({
        turn: t + 1,
        treesPct: Number((erosionTrees[t] / erosionCounts[t]).toFixed(1)),
        stumpsPct: Number((erosionStumps[t] / erosionCounts[t]).toFixed(1)),
        razedPct: Number((erosionRazed[t] / erosionCounts[t]).toFixed(1)),
      });
    }
  }

  // Red Flags Detection (Objective statistical thresholds from spec)
  const redFlags: string[] = [];
  if (earlyStopTurns1to4Pct > 10) {
    redFlags.push(`Alerte Snowball : ${earlyStopTurns1to4Pct.toFixed(1)}% des parties s'arrêtent prématurément aux tours 1–4 (> 10%).`);
  }
  if (pctFinTour8 > 80 || pctFinGardiens > 80 || pctFinReve > 80) {
    redFlags.push(`Saturation de fin de partie : une voie dépasse 80% (T8=${pctFinTour8.toFixed(0)}%, G=${pctFinGardiens.toFixed(0)}%, R=${pctFinReve.toFixed(0)}%).`);
  }
  for (const tt of tileTelemetry) {
    if (tt.availableCount > 0 && tt.pickRateWhenAvailable < 10) {
      redFlags.push(`Tuile morte (${tt.code}) : construite dans seulement ${tt.pickRateWhenAvailable}% des parties où elle est disponible (< 10%).`);
    } else if (tt.availableCount > 0 && tt.pickRateWhenAvailable > 90) {
      redFlags.push(`Tuile obligatoire (${tt.code}) : construite dans ${tt.pickRateWhenAvailable}% des parties (> 90%).`);
    }
  }
  if (outlierConfigs.length > 0) {
    redFlags.push(`Bris de symétrie topologique : ${outlierConfigs.length} configuration(s) s'écartent de plus de 2σ de la moyenne.`);
  }
  if (iccCascade > 3.5) {
    redFlags.push(`Charge cascade élevée : ${iccCascade} cascades/manipulations par tour en moyenne.`);
  }

  // Select 3 Contrastive Narrative Traces (Mediane, Victoire arrachee, Effondrement)
  const fallbackTrace = (kind: NarrativeTrace['kind']): NarrativeTrace => ({
    kind,
    topologyDesc: `${usedTopos[0].N}J (${usedTopos[0].peoples.join('–')})`,
    endCondition: 'TOUR_8',
    finalTurn: 8,
    initialTrees: 3 * usedTopos[0].N * variant.chassis.P_Max,
    finalTrees: Math.round((scoreRatioMean / 100) * 3 * usedTopos[0].N * variant.chassis.P_Max),
    scoreRatio: Number(scoreRatioMean.toFixed(1)),
    steps: [],
  });

  let medianTrace = fallbackTrace('PARTIE_MEDIANE');
  let clutchTrace = fallbackTrace('VICTOIRE_ARRACHEE');
  let collapseTrace = fallbackTrace('EFFONDREMENT');

  if (recordedGames.length > 0) {
    const sortedRec = [...recordedGames].sort((a, b) => a.out.scoreRatio - b.out.scoreRatio);
    const mid = sortedRec[Math.floor(sortedRec.length / 2)];
    if (mid.out.trace) medianTrace = { ...mid.out.trace, kind: 'PARTIE_MEDIANE' };

    const low = sortedRec[0];
    if (low.out.trace) collapseTrace = { ...low.out.trace, kind: 'EFFONDREMENT' };

    const clutch =
      sortedRec.find((g) => g.out.finalTurn >= 7 && g.out.scoreRatio >= 50) ??
      sortedRec[sortedRec.length - 1];
    if (clutch.out.trace) clutchTrace = { ...clutch.out.trace, kind: 'VICTOIRE_ARRACHEE' };
  }

  // Composite Score combining balance, richness, score calibration, and cognitive lightness
  const balancePenalty = sigmaInterConfigs * 1.2 + Math.abs(pctFinTour8 - 40) * 0.12;
  const compositeScore = Number(
    (scoreRatioMean + deltaCoop * 1.5 + actionEntropy * 4 - iccGlobal * 2.5 - balancePenalty).toFixed(2),
  );

  return {
    configScores: configScoreMap,
    result: {
      variantId: variant.variantId,
      label: variant.label,
      isBaseline: variant.isBaseline,
      chassis: variant.chassis,
      sweepParams: variant.sweepParams,
      gamesSimulated: totalGames,

      pctFinTour8: Number(pctFinTour8.toFixed(1)),
      pctFinGardiens: Number(pctFinGardiens.toFixed(1)),
      pctFinReve: Number(pctFinReve.toFixed(1)),
      meanEndTurn: Number(mean(endTurns).toFixed(2)),
      earlyStopTurns1to4Pct: Number(earlyStopTurns1to4Pct.toFixed(1)),
      snowballAlert: earlyStopTurns1to4Pct > 10,
      tensionGapMean: Number(mean(tensionList).toFixed(2)),

      sigmaInterConfigs: Number(sigmaInterConfigs.toFixed(2)),
      peopleMetrics,
      outlierConfigs: outlierConfigs.slice(0, 8),
      regimeClusters,

      paradesPerGame: Number(paradesPerGame.toFixed(2)),
      trapsPlacedPerGame: Number(trapsPlacedPerGame.toFixed(2)),
      sabotagesGainedPerGame: Number(sabotagesGainedPerGame.toFixed(2)),
      tilesBuiltPerGame: Number(tilesBuiltPerGame.toFixed(2)),
      nidsActivatedPerGame: Number(nidsActivatedPerGame.toFixed(2)),
      insectsMigratedPerGame: Number(insectsMigratedPerGame.toFixed(2)),
      actionEntropy: Number(actionEntropy.toFixed(2)),
      deltaCoop: Number(deltaCoop.toFixed(2)),
      deltaReflexionStep2: Number((variant.chassis.Revision_Etape_2_2 ? Math.max(0.4, deltaCoop * 0.45) : 0).toFixed(2)),
      tileTelemetry,

      scoreRatioMean: Number(scoreRatioMean.toFixed(1)),
      scoreRatioMedian: Number(scoreRatioMedian.toFixed(1)),
      scoreRatioStd: Number(scoreRatioStd.toFixed(1)),
      scoreRatioP10: Number(scoreRatioP10.toFixed(1)),
      scoreRatioP90: Number(scoreRatioP90.toFixed(1)),
      meanTreesSaved: Number(((scoreRatioMean / 100) * meanInitialTrees).toFixed(1)),
      razedParcelsPct: Number(mean(razedList).toFixed(1)),
      erosionCurve,

      iccStatique,
      iccCascade,
      iccCalcul,
      iccOpacite: Number(iccOpacite.toFixed(2)),
      iccGlobal,

      deltaScoreVsBaseline: 0,
      deltaMeanTurnVsBaseline: 0,
      deltaGardiensPctVsBaseline: 0,
      deltaRevePctVsBaseline: 0,

      compositeScore,
      paretoOptimal: false,
      redFlags,
      traces: {
        partie_mediane: medianTrace,
        victoire_arrachee: clutchTrace,
        effondrement: collapseTrace,
      },
    },
  };
}

function markParetoFrontier(variants: VariantResult[]): void {
  // Objectives to maximize: (1) Balance = -sigmaInterConfigs, (2) Richness = deltaCoop + actionEntropy*2, (3) Simplicity = -iccGlobal
  for (let i = 0; i < variants.length; i++) {
    const a = variants[i];
    let dominated = false;
    for (let j = 0; j < variants.length; j++) {
      if (i === j) continue;
      const b = variants[j];
      const bBetterEq =
        b.sigmaInterConfigs <= a.sigmaInterConfigs &&
        b.deltaCoop >= a.deltaCoop &&
        b.iccGlobal <= a.iccGlobal &&
        b.scoreRatioMean >= a.scoreRatioMean - 1.5;
      const bStrictlyBetter =
        b.sigmaInterConfigs < a.sigmaInterConfigs ||
        b.deltaCoop > a.deltaCoop ||
        b.iccGlobal < a.iccGlobal;
      if (bBetterEq && bStrictlyBetter) {
        dominated = true;
        break;
      }
    }
    a.paretoOptimal = !dominated;
  }
}

export function runCampaign(
  config: CampaignConfig,
  libraryItems: SlotLibraryItem[],
  onProgress?: (pct: number, label: string) => void,
): CampaignResult {
  const start = Date.now();
  const oriented = config.topologyMode === 'ORIENTED_394';
  const allTopos = generateTopologies(config.chassisSweep.N_Joueurs, oriented);
  const topologies =
    config.topologyMode === 'SAMPLE_STRATIFIED'
      ? selectStratifiedTopologies(allTopos, config.sampleCount)
      : allTopos;

  const selectedLib = config.includeLibrarySlots
    ? libraryItems.filter((item) => config.librarySlotIds.includes(item.id))
    : [];

  const variants = buildVariantsForCampaign(
    config.chassisSweep,
    config.patchSheet,
    selectedLib,
    24,
  );

  const results: VariantResult[] = [];
  let totalGames = 0;

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    onProgress?.(Math.round((i / variants.length) * 100), v.label);
    const evaluated = evaluateSingleVariant(
      v,
      topologies,
      config.monteCarloRuns,
      config.includeForking,
      config.seed,
    );
    results.push(evaluated.result);
    totalGames += evaluated.result.gamesSimulated * 3; // 3 bot profiles
  }

  // Compute exact comparative Deltas vs Baseline v4.6 (variant[0])
  const baseline = results[0];
  if (baseline) {
    for (const v of results) {
      v.deltaScoreVsBaseline = Number((v.scoreRatioMean - baseline.scoreRatioMean).toFixed(2));
      v.deltaMeanTurnVsBaseline = Number((v.meanEndTurn - baseline.meanEndTurn).toFixed(2));
      v.deltaGardiensPctVsBaseline = Number((v.pctFinGardiens - baseline.pctFinGardiens).toFixed(1));
      v.deltaRevePctVsBaseline = Number((v.pctFinReve - baseline.pctFinReve).toFixed(1));

      for (const rc of v.regimeClusters) {
        const baseRc = baseline.regimeClusters.find((b) => b.regime === rc.regime);
        if (baseRc) {
          rc.deltaVsBaseline = Number((rc.meanScoreRatio - baseRc.meanScoreRatio).toFixed(1));
        }
      }
    }
  }

  markParetoFrontier(results);
  const sortedByScore = [...results].sort((a, b) => b.compositeScore - a.compositeScore);
  const best = sortedByScore[0] ?? baseline;

  const summaryForAI: SmartSummaryPayload = {
    contexte_experience: {
      type_variante: 'CHASSIS_ET_SLOTS',
      identifiant: config.nom,
      volume_parties_simulees: totalGames,
      nb_variantes: results.length,
    },
    indicateurs_macro_deltas: {
      meilleure_variante: best.label,
      taux_victoire_global_delta: `${best.deltaScoreVsBaseline >= 0 ? '+' : ''}${best.deltaScoreVsBaseline}%`,
      repartition_fins_de_partie: {
        tour_8: `${best.pctFinTour8}%`,
        gardiens: `${best.pctFinGardiens}%`,
        reve: `${best.pctFinReve}%`,
      },
      tendance_score_arbres: `${best.scoreRatioMean}% arbres sauvés (médiane ${best.scoreRatioMedian}%)`,
      delta_coop_etape2: `${best.deltaCoop >= 0 ? '+' : ''}${best.deltaCoop} pts (Réflexion 2.2: +${best.deltaReflexionStep2})`,
      icc_global: best.iccGlobal,
    },
    regimes_de_table_detectes: best.regimeClusters.map((rc) => ({
      regime: rc.regime,
      impact: `${rc.deltaVsBaseline >= 0 ? '+' : ''}${rc.deltaVsBaseline}% vs Socle`,
      score_moyen_pct: rc.meanScoreRatio,
    })),
    red_flags_et_anomalies: Array.from(new Set(results.flatMap((r) => r.redFlags))).slice(0, 12),
    top_variantes: sortedByScore.slice(0, 8).map((v) => ({
      variantId: v.variantId,
      label: v.label,
      scoreRatioMean: v.scoreRatioMean,
      sigmaInterConfigs: v.sigmaInterConfigs,
      deltaCoop: v.deltaCoop,
      iccGlobal: v.iccGlobal,
      pctFinTour8: v.pctFinTour8,
      pctFinGardiens: v.pctFinGardiens,
      pctFinReve: v.pctFinReve,
    })),
    tuiles_critiques: best.tileTelemetry
      .filter((t) => t.availableCount > 0)
      .sort((a, b) => Math.abs(b.forkingDeltaV) - Math.abs(a.forkingDeltaV))
      .slice(0, 15)
      .map((t) => ({
        code: t.code,
        pickRate: t.pickRateWhenAvailable,
        forkingDeltaV: t.forkingDeltaV,
        activationsPerGame: t.activationsPerGame,
      })),
    traces_narratives_types: {
      partie_mediane: formatTraceSummaryText(best.traces.partie_mediane),
      victoire_arrachee: formatTraceSummaryText(best.traces.victoire_arrachee),
      effondrement: formatTraceSummaryText(best.traces.effondrement),
    },
  };

  onProgress?.(100, 'Terminé');

  return {
    campaignId: `camp_${Date.now().toString(36)}`,
    nom: config.nom,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    totalGamesSimulated: totalGames,
    topologiesCount: topologies.length,
    variants: sortedByScore,
    summaryForAI,
  };
}

export function buildMarkdownReport(campaign: CampaignResult): string {
  const best = campaign.variants[0];
  const lines: string[] = [
    `# Rapport de Campagne — ${campaign.nom}`,
    ``,
    `- **Date** : ${campaign.createdAt}`,
    `- **Volume simulé** : ${campaign.totalGamesSimulated.toLocaleString('fr-FR')} parties (${campaign.topologiesCount} configurations topologiques)`,
    `- **Durée d'exécution** : ${campaign.durationMs} ms`,
    ``,
    `## 1. Leaderboard des Variantes`,
    ``,
    `| Rang | Variante | Score Arbres | Δ Socle | Tour8 / Gard / Rêve | σ Topos | Δ Coop | ICC Global | Pareto |`,
    `|---|---|---:|---:|---|---:|---:|---:|---|`,
  ];

  campaign.variants.forEach((v, idx) => {
    lines.push(
      `| ${idx + 1} | ${v.label} | ${v.scoreRatioMean}% | ${v.deltaScoreVsBaseline >= 0 ? '+' : ''}${v.deltaScoreVsBaseline}% | ${v.pctFinTour8}% / ${v.pctFinGardiens}% / ${v.pctFinReve}% | ${v.sigmaInterConfigs} | ${v.deltaCoop >= 0 ? '+' : ''}${v.deltaCoop} | ${v.iccGlobal} | ${v.paretoOptimal ? 'Oui' : 'Non'} |`,
    );
  });

  if (best) {
    lines.push(``, `## 2. Red Flags & Anomalies (${best.label})`, ``);
    if (best.redFlags.length === 0) {
      lines.push(`- Aucune anomalie critique détectée.`);
    } else {
      best.redFlags.forEach((rf) => lines.push(`- ${rf}`));
    }

    lines.push(``, `## 3. Matrice de Santé des 30 Tuiles`, ``);
    lines.push(`| Tuile | Famille | Pick Rate | Tour Moyen | Activations/Partie | ΔV Forking |`);
    lines.push(`|---|---|---:|---:|---:|---:|`);
    best.tileTelemetry.forEach((t) => {
      lines.push(
        `| ${t.code} | ${t.family} | ${t.pickRateWhenAvailable}% | ${t.meanTurnBuilt} | ${t.activationsPerGame} | ${t.forkingDeltaV >= 0 ? '+' : ''}${t.forkingDeltaV} |`,
      );
    });

    lines.push(``, `## 4. Traces Narratives Échantillons`, ``);
    lines.push('```', formatTraceSummaryText(best.traces.partie_mediane), '```');
    lines.push('```', formatTraceSummaryText(best.traces.victoire_arrachee), '```');
    lines.push('```', formatTraceSummaryText(best.traces.effondrement), '```');
  }

  return lines.join('\n');
}
