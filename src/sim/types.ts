/**
 * Core domain types for Amazonia : Dernier Rempart (v4.6) Simulator
 */

export type PeopleCode = 'M' | 'R' | 'O' | 'H' | 'E' | 'I';
export type PeopleGroup = 'ANIMAL' | 'ONIRIQUE' | 'SYMBIOTIQUE';

export type TileFamily = 'G' | 'R' | 'M';

export type EndCondition = 'EN_COURS' | 'TOUR_8' | 'GARDIENS' | 'REVE';

export type ComportementBoutRayon =
  | 'FRAPPE_SUR_PLACE'
  | 'FRAPPE_A_VIDE_AVANT'
  | 'DEGAT_COEUR'
  | 'BOUCLE_VOISIN';

export type RegleSeuilGardiens =
  | 'FIXE_N'
  | 'ADAPTATIF_DISPO'
  | 'COMPTEUR_RESONANCE';

export interface GrowthThreshold {
  minInsects: number;
  maxInsects: number;
  spawn: number;
}

export interface ChassisConfig {
  N_Joueurs: 3 | 4 | 5 | 6 | 'ALL';
  P_Max: number; // e.g., 3, 4, 5
  Comportement_Bout_Rayon: ComportementBoutRayon;
  Regle_Seuil_Gardiens: RegleSeuilGardiens;
  Seuil_Resonance_Activations: number; // used when COMPTEUR_RESONANCE
  Courbe_Croissance_Nid: GrowthThreshold[];
  Revision_Etape_2_2: boolean;
}

export interface ChassisSweepConfig {
  N_Joueurs: (3 | 4 | 5 | 6)[];
  P_Max: number[];
  Comportement_Bout_Rayon: ComportementBoutRayon[];
  Regle_Seuil_Gardiens: RegleSeuilGardiens[];
  Seuil_Resonance_Activations: number[];
  Courbe_Croissance_Nid: GrowthThreshold[][];
  Revision_Etape_2_2: boolean[];
}

export type LifecycleArchitecture =
  | 'SIMPLE_CONTINU'
  | 'DOUBLE_FACE_UPGRADE'
  | 'SACRIFICE_ONESHOT';

export type SacrificeModality = 'RETOUR_FACE_EPUISEE' | 'RENVOI_LISIERE';

export type InsectAttachment =
  | 'RANG_PHYSIQUE'
  | 'TUILE'
  | 'CASE_DECLENCHEUR';

export type InsectHook =
  | 'ETAPE_3_2_REVELATION'
  | 'ETAPE_4_3_ARRIVEE'
  | 'ETAPE_5_ATTAQUE'
  | 'ETAPE_6_APPRENTISSAGE'
  | 'SUR_DECLENCHEUR';

export type InsectConsumption = 'CONSOMME_ONESHOT' | 'PASSIF_CONTINU';

export type PrimitiveType =
  | 'MOD_SEUIL'
  | 'CREATION_ENTITE'
  | 'DEPLACEMENT'
  | 'MOD_PUISSANCE'
  | 'MOD_APPRENTISSAGE'
  | 'PERMUTATION_PISTE'
  | 'PARTAGE_INFO_ETAT_GARDIEN';

export type TargetSelector =
  | 'PARCELLE_MACHINE_AVANCEE'
  | 'PARCELLE_PLUS_MENACEE'
  | 'PARCELLE_DU_NID'
  | 'TOUTES_PARCELLES_CIBLEES'
  | 'LISIERE_VOISINE'
  | 'RANG_DU_DE_M'
  | 'RANG_REVE_ACTIF'
  | 'TACTIQUE_EN_TETE'
  | 'GARDIEN_CIBLE_OU_LIBRE'
  | 'MACHINE_PLUS_PUISSANTE';

export type EffectCondition =
  | 'AUCUNE'
  | 'SI_ARBRES_MENACES'
  | 'SI_DE_M_PAIR'
  | 'SI_DE_M_IMPAIR'
  | 'SI_REVE_EN_JEU'
  | 'SI_INSECTE_SUR_PISTE'
  | 'SI_SOUCHES_PRESENTES';

export type SweepValue<T> = T | { $Sweep: T[] };

export interface SlotEffectSpec {
  condition?: SweepValue<EffectCondition>;
  cible: SweepValue<TargetSelector>;
  primitive: SweepValue<PrimitiveType>;
  // Primitive parameters (typed generously to cover all 7 primitives)
  valeur_X?: SweepValue<number>;
  auto_parade_bool?: SweepValue<boolean>;
  entite_type?: SweepValue<'PIEGE' | 'INSECTE' | 'SABOTAGE' | 'REPOUSSE_ARBRE'>;
  deplacement_type?: SweepValue<'DEFENSEUR' | 'PIEGE' | 'INSECTE' | 'MACHINE_RECUL'>;
  amplitude?: SweepValue<number>;
  bloquer_gain_etape5_bool?: SweepValue<boolean>;
  direction?: SweepValue<'GAUCHE' | 'DROITE'>;
  decalage_lecture_de_M?: SweepValue<number>;
  type_action?: SweepValue<
    'REVELER_MACHINE' | 'REVELER_DE_M' | 'FLIP_GARDIEN_F2' | 'REACTIVER_GARDIEN'
  >;
}

export interface SlotDefinition {
  id_slot: string; // G1..G15, R1..R10, M1..M5, INSECTE_BUG, INSECTE_COLONIE
  nom?: string;
  description?: string;
  architecture_cycle_vie?: SweepValue<LifecycleArchitecture>;
  modalite_sacrifice?: SweepValue<SacrificeModality>;
  declencheur_cablage?: SweepValue<'LIBRE' | number>; // number 1..6 = AFFINITE_RECOMMANDEE
  parametres_insectes?: {
    attachement: SweepValue<InsectAttachment>;
    hook_temporel: SweepValue<InsectHook>;
    mode_consommation: SweepValue<InsectConsumption>;
  };
  effets: SlotEffectSpec[];
  effets_face2?: SlotEffectSpec[];
  effets_sacrifice?: SlotEffectSpec[];
}

export interface PatchSheet {
  id: string;
  nom: string;
  version: string;
  mode: 'BASELINE' | 'CUSTOM';
  description: string;
  slots: Record<string, SlotDefinition>;
}

export interface SlotLibraryItem {
  id: string;
  label: string;
  targetSlotId: string; // e.g. "G1", "R3", "INSECTE_BUG"
  tags: string[];
  slot: SlotDefinition;
  enabledForSweep: boolean;
  createdAt: string;
}

export type BotProfile = 'REFLEXE' | 'COOPERATIF' | 'ORACLE';

export interface TopologyConfig {
  id: number;
  N: 3 | 4 | 5 | 6;
  peoples: PeopleCode[]; // clockwise around the wheel
  oriented: boolean;
  // Asymmetric signature
  nbG: number;
  nbR: number;
  nbM: number;
  intraAnimalCount: number; // pairs among G1..G6
  intraOniriqueCount: number; // pairs among R1..R2
  lisiereTiles: [number, number][]; // N pairs of tile numeric IDs (1..30)
  regimeTag: string;
}

export interface CompiledInstruction {
  primitiveId: number; // 1..7
  targetSelectorId: number;
  param1: number;
  param2: number;
  conditionId: number;
  hookId: number;
}

export interface CompiledSlot {
  slotNumericId: number; // 1..30 for tiles, 31 for INSECTE_BUG, 32 for INSECTE_COLONIE
  slotCode: string;
  lifecycle: number; // 0=SIMPLE, 1=DOUBLE_FACE, 2=SACRIFICE
  sacrificeModality: number; // 0=EPUISEE, 1=RENVOI_LISIERE
  triggerAffinity: number; // 0=LIBRE, 1..6=affinity
  insectAttachment: number; // 0=RANG, 1=TUILE, 2=CASE_DECLENCHEUR
  insectHook: number; // 0..4
  insectConsumption: number; // 0=ONESHOT, 1=PASSIF
  face1: CompiledInstruction[];
  face2: CompiledInstruction[];
  sacrifice: CompiledInstruction[];
}

export interface CompiledVariant {
  variantId: string;
  label: string;
  chassis: ChassisConfig;
  patchId: string;
  patchName: string;
  sweepParams: Record<string, string | number | boolean>;
  slotsByNumericId: CompiledSlot[]; // index 1..32
  iccStatique: number;
  isBaseline: boolean;
}

export interface TileTelemetry {
  tileId: number;
  code: string;
  family: TileFamily;
  availableCount: number;
  builtCount: number;
  pickRateWhenAvailable: number;
  meanTurnBuilt: number;
  activationsPerGame: number;
  upgradeF2Rate: number;
  sacrificeRate: number;
  forkingDeltaV: number; // Marginal trees saved via State Forking
  forkingInversionRate: number;
}

export interface PeopleMetrics {
  people: PeopleCode;
  label: string;
  gamesPresent: number;
  meanScoreRatio: number;
  earlyStopRate: number;
}

export interface RegimeCluster {
  regime: string;
  configCount: number;
  meanScoreRatio: number;
  deltaVsBaseline: number;
  winModeDistribution: { tour8: number; gardiens: number; reve: number };
}

export interface NarrativeStepLog {
  tour: number;
  resume: string;
  arbresDebout: number;
  souches: number;
  parcellesRasees: number;
  gardiensPoses: number;
  revePlusAvance: number; // rank 1..6 or 0 if none
}

export interface NarrativeTrace {
  kind: 'PARTIE_MEDIANE' | 'VICTOIRE_ARRACHEE' | 'EFFONDREMENT';
  topologyDesc: string;
  endCondition: EndCondition;
  finalTurn: number;
  initialTrees: number;
  finalTrees: number;
  scoreRatio: number;
  steps: NarrativeStepLog[];
}

export interface VariantResult {
  variantId: string;
  label: string;
  isBaseline: boolean;
  chassis: ChassisConfig;
  sweepParams: Record<string, string | number | boolean>;
  gamesSimulated: number;

  // Axe 1 : Rythme, Tension & Fins de partie
  pctFinTour8: number;
  pctFinGardiens: number;
  pctFinReve: number;
  meanEndTurn: number;
  earlyStopTurns1to4Pct: number;
  snowballAlert: boolean;
  tensionGapMean: number;

  // Axe 2 : Équilibre Asymétrique & Invariance Topologique
  sigmaInterConfigs: number;
  peopleMetrics: PeopleMetrics[];
  outlierConfigs: { configId: number; label: string; scoreRatio: number; zScore: number }[];
  regimeClusters: RegimeCluster[];

  // Axe 3 : Richesse Stratégique, Coopération & Entropie
  paradesPerGame: number;
  trapsPlacedPerGame: number;
  sabotagesGainedPerGame: number;
  tilesBuiltPerGame: number;
  nidsActivatedPerGame: number;
  insectsMigratedPerGame: number;
  actionEntropy: number;
  deltaCoop: number; // Cooperatif - Reflexe (score ratio pts)
  deltaReflexionStep2: number; // Gain specifically from Step 2.2 revision
  tileTelemetry: TileTelemetry[];

  // Axe 4 : Calibration du Score (Arbres après Repousse)
  scoreRatioMean: number; // % of initial trees saved
  scoreRatioMedian: number;
  scoreRatioStd: number;
  scoreRatioP10: number;
  scoreRatioP90: number;
  meanTreesSaved: number;
  razedParcelsPct: number;
  erosionCurve: { turn: number; treesPct: number; stumpsPct: number; razedPct: number }[];

  // Axe 5 : Charge Cognitive (ICC)
  iccStatique: number;
  iccCascade: number;
  iccCalcul: number;
  iccOpacite: number; // Oracle - Cooperatif gap
  iccGlobal: number;

  // Deltas vs Baseline
  deltaScoreVsBaseline: number;
  deltaMeanTurnVsBaseline: number;
  deltaGardiensPctVsBaseline: number;
  deltaRevePctVsBaseline: number;

  // Pareto & Composite
  compositeScore: number;
  paretoOptimal: boolean;

  // Smart Summarization Outputs
  redFlags: string[];
  traces: {
    partie_mediane: NarrativeTrace;
    victoire_arrachee: NarrativeTrace;
    effondrement: NarrativeTrace;
  };
}

export interface CampaignConfig {
  nom: string;
  chassisSweep: ChassisSweepConfig;
  patchSheet: PatchSheet;
  includeLibrarySlots: boolean;
  librarySlotIds: string[];
  topologyMode: 'ALL_197' | 'ORIENTED_394' | 'SAMPLE_STRATIFIED';
  sampleCount: number; // used if SAMPLE_STRATIFIED
  monteCarloRuns: number; // K per config x profile
  includeForking: boolean;
  seed: number;
}

export interface SmartSummaryPayload {
  contexte_experience: {
    type_variante: 'CHASSIS_ET_SLOTS';
    identifiant: string;
    volume_parties_simulees: number;
    nb_variantes: number;
  };
  indicateurs_macro_deltas: {
    meilleure_variante: string;
    taux_victoire_global_delta: string;
    repartition_fins_de_partie: { tour_8: string; gardiens: string; reve: string };
    tendance_score_arbres: string;
    delta_coop_etape2: string;
    icc_global: number;
  };
  regimes_de_table_detectes: {
    regime: string;
    impact: string;
    score_moyen_pct: number;
  }[];
  red_flags_et_anomalies: string[];
  top_variantes: {
    variantId: string;
    label: string;
    scoreRatioMean: number;
    sigmaInterConfigs: number;
    deltaCoop: number;
    iccGlobal: number;
    pctFinTour8: number;
    pctFinGardiens: number;
    pctFinReve: number;
  }[];
  tuiles_critiques: {
    code: string;
    pickRate: number;
    forkingDeltaV: number;
    activationsPerGame: number;
  }[];
  traces_narratives_types: {
    partie_mediane: string;
    victoire_arrachee: string;
    effondrement: string;
  };
}

export interface CampaignResult {
  campaignId: string;
  nom: string;
  createdAt: string;
  durationMs: number;
  totalGamesSimulated: number;
  topologiesCount: number;
  variants: VariantResult[];
  summaryForAI: SmartSummaryPayload;
}

export interface AiAnalysisResponse {
  diagnostic_global: string;
  equilibre_fins_de_partie: string;
  evaluation_cooperation_et_opacite: string;
  diagnostic_tuiles_et_slots: string;
  recommandations_prioritaires: string[];
  patch_correctif: PatchSheet;
}
