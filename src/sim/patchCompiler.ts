import { load as loadYaml } from 'js-yaml';
import type {
  ChassisConfig,
  ChassisSweepConfig,
  CompiledInstruction,
  CompiledSlot,
  CompiledVariant,
  EffectCondition,
  InsectAttachment,
  InsectConsumption,
  InsectHook,
  LifecycleArchitecture,
  PatchSheet,
  PrimitiveType,
  SacrificeModality,
  SlotDefinition,
  SlotEffectSpec,
  SlotLibraryItem,
  TargetSelector,
} from './types.ts';
import { TILES_META } from './topology.ts';
import { BASELINE_PATCH_V4_6 } from './defaultPatches.ts';

export const PRIMITIVE_IDS: Record<PrimitiveType, number> = {
  MOD_SEUIL: 1,
  CREATION_ENTITE: 2,
  DEPLACEMENT: 3,
  MOD_PUISSANCE: 4,
  MOD_APPRENTISSAGE: 5,
  PERMUTATION_PISTE: 6,
  PARTAGE_INFO_ETAT_GARDIEN: 7,
};

export const TARGET_IDS: Record<TargetSelector, number> = {
  PARCELLE_MACHINE_AVANCEE: 1,
  PARCELLE_PLUS_MENACEE: 2,
  PARCELLE_DU_NID: 3,
  TOUTES_PARCELLES_CIBLEES: 4,
  LISIERE_VOISINE: 5,
  RANG_DU_DE_M: 6,
  RANG_REVE_ACTIF: 7,
  TACTIQUE_EN_TETE: 8,
  GARDIEN_CIBLE_OU_LIBRE: 9,
  MACHINE_PLUS_PUISSANTE: 10,
};

export const CONDITION_IDS: Record<EffectCondition, number> = {
  AUCUNE: 0,
  SI_ARBRES_MENACES: 1,
  SI_DE_M_PAIR: 2,
  SI_DE_M_IMPAIR: 3,
  SI_REVE_EN_JEU: 4,
  SI_INSECTE_SUR_PISTE: 5,
  SI_SOUCHES_PRESENTES: 6,
};

const ENTITE_SUBTYPE: Record<string, number> = {
  PIEGE: 1,
  INSECTE: 2,
  SABOTAGE: 3,
  REPOUSSE_ARBRE: 4,
};

const DEPLACEMENT_SUBTYPE: Record<string, number> = {
  DEFENSEUR: 1,
  PIEGE: 2,
  INSECTE: 3,
  MACHINE_RECUL: 4,
};

const ACTION_GARDIEN_SUBTYPE: Record<string, number> = {
  REVELER_MACHINE: 1,
  REVELER_DE_M: 2,
  FLIP_GARDIEN_F2: 3,
  REACTIVER_GARDIEN: 4,
};

const LIFECYCLE_IDS: Record<LifecycleArchitecture, number> = {
  SIMPLE_CONTINU: 0,
  DOUBLE_FACE_UPGRADE: 1,
  SACRIFICE_ONESHOT: 2,
};

const SACRIFICE_IDS: Record<SacrificeModality, number> = {
  RETOUR_FACE_EPUISEE: 0,
  RENVOI_LISIERE: 1,
};

const ATTACH_IDS: Record<InsectAttachment, number> = {
  RANG_PHYSIQUE: 0,
  TUILE: 1,
  CASE_DECLENCHEUR: 2,
};

const HOOK_IDS: Record<InsectHook, number> = {
  ETAPE_3_2_REVELATION: 0,
  ETAPE_4_3_ARRIVEE: 1,
  ETAPE_5_ATTAQUE: 2,
  ETAPE_6_APPRENTISSAGE: 3,
  SUR_DECLENCHEUR: 4,
};

const CONSUMPTION_IDS: Record<InsectConsumption, number> = {
  CONSOMME_ONESHOT: 0,
  PASSIF_CONTINU: 1,
};

export function parsePatchOrSlotText(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  return loadYaml(trimmed);
}

interface SweepPoint {
  path: string;
  values: unknown[];
}

function collectSweeps(obj: unknown, path: string, out: SweepPoint[]): void {
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => collectSweeps(item, `${path}[${idx}]`, out));
    return;
  }
  const rec = obj as Record<string, unknown>;
  if ('$Sweep' in rec && Array.isArray(rec['$Sweep'])) {
    out.push({ path, values: rec['$Sweep'] });
    return;
  }
  for (const [k, v] of Object.entries(rec)) {
    collectSweeps(v, path ? `${path}.${k}` : k, out);
  }
}

function applySweepValues(obj: unknown, path: string, chosen: Map<string, unknown>): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => applySweepValues(item, `${path}[${idx}]`, chosen));
  }
  const rec = obj as Record<string, unknown>;
  if ('$Sweep' in rec && Array.isArray(rec['$Sweep'])) {
    return chosen.get(path);
  }
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    copy[k] = applySweepValues(v, path ? `${path}.${k}` : k, chosen);
  }
  return copy;
}

function expandSlotSweeps(slot: SlotDefinition): {
  slot: SlotDefinition;
  params: Record<string, string | number | boolean>;
}[] {
  const sweeps: SweepPoint[] = [];
  collectSweeps(slot, '', sweeps);
  if (sweeps.length === 0) {
    return [{ slot, params: {} }];
  }

  let combos: Map<string, unknown>[] = [new Map()];
  for (const sp of sweeps) {
    const next: Map<string, unknown>[] = [];
    for (const c of combos) {
      for (const v of sp.values) {
        const m = new Map(c);
        m.set(sp.path, v);
        next.push(m);
      }
    }
    combos = next;
  }

  return combos.map((m) => {
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of m.entries()) {
      params[`${slot.id_slot}.${k}`] =
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          ? v
          : JSON.stringify(v);
    }
    return {
      slot: applySweepValues(slot, '', m) as SlotDefinition,
      params,
    };
  });
}

function compileEffect(eff: SlotEffectSpec, hookId: number): CompiledInstruction {
  const prim = eff.primitive as PrimitiveType;
  const primitiveId = PRIMITIVE_IDS[prim] ?? 1;
  const targetSelectorId = TARGET_IDS[eff.cible as TargetSelector] ?? 2;
  const conditionId = CONDITION_IDS[(eff.condition as EffectCondition) ?? 'AUCUNE'] ?? 0;

  let param1 = 0;
  let param2 = 0;

  switch (prim) {
    case 'MOD_SEUIL':
      param1 = Number(eff.valeur_X ?? 1);
      param2 = eff.auto_parade_bool ? 1 : 0;
      break;
    case 'CREATION_ENTITE':
      param1 = ENTITE_SUBTYPE[String(eff.entite_type ?? 'PIEGE')] ?? 1;
      param2 = 1;
      break;
    case 'DEPLACEMENT':
      param1 = DEPLACEMENT_SUBTYPE[String(eff.deplacement_type ?? 'DEFENSEUR')] ?? 1;
      param2 = Number(eff.amplitude ?? 1);
      break;
    case 'MOD_PUISSANCE':
      param1 = Number(eff.valeur_X ?? -1);
      param2 = eff.bloquer_gain_etape5_bool ? 1 : 0;
      break;
    case 'MOD_APPRENTISSAGE':
      param1 = Number(eff.valeur_X ?? 1);
      param2 = 0;
      break;
    case 'PERMUTATION_PISTE':
      param1 = eff.direction === 'DROITE' ? 1 : -1;
      param2 = Number(eff.decalage_lecture_de_M ?? 0);
      break;
    case 'PARTAGE_INFO_ETAT_GARDIEN':
      param1 = ACTION_GARDIEN_SUBTYPE[String(eff.type_action ?? 'REACTIVER_GARDIEN')] ?? 4;
      param2 = 1;
      break;
  }

  return {
    primitiveId,
    targetSelectorId,
    param1,
    param2,
    conditionId,
    hookId,
  };
}

export function slotCodeToNumericId(code: string): number {
  if (code === 'INSECTE_BUG') return 31;
  if (code === 'INSECTE_COLONIE') return 32;
  const meta = TILES_META.find((t) => t.code === code);
  return meta ? meta.numericId : 0;
}

function compileSlot(slot: SlotDefinition): CompiledSlot {
  const numId = slotCodeToNumericId(slot.id_slot);
  const hookId = slot.parametres_insectes
    ? HOOK_IDS[slot.parametres_insectes.hook_temporel as InsectHook] ?? 2
    : 0;

  return {
    slotNumericId: numId,
    slotCode: slot.id_slot,
    lifecycle:
      LIFECYCLE_IDS[(slot.architecture_cycle_vie as LifecycleArchitecture) ?? 'SIMPLE_CONTINU'] ?? 0,
    sacrificeModality:
      SACRIFICE_IDS[(slot.modalite_sacrifice as SacrificeModality) ?? 'RETOUR_FACE_EPUISEE'] ?? 0,
    triggerAffinity:
      typeof slot.declencheur_cablage === 'number' ? slot.declencheur_cablage : 0,
    insectAttachment: slot.parametres_insectes
      ? ATTACH_IDS[slot.parametres_insectes.attachement as InsectAttachment] ?? 0
      : 0,
    insectHook: hookId,
    insectConsumption: slot.parametres_insectes
      ? CONSUMPTION_IDS[slot.parametres_insectes.mode_consommation as InsectConsumption] ?? 1
      : 1,
    face1: (slot.effets ?? []).map((e) => compileEffect(e, hookId)),
    face2: (slot.effets_face2 ?? []).map((e) => compileEffect(e, hookId)),
    sacrifice: (slot.effets_sacrifice ?? []).map((e) => compileEffect(e, hookId)),
  };
}

function computeStaticIcc(slots: CompiledSlot[]): number {
  let activeSlots = 0;
  let totalPrimitives = 0;
  let complexityPenalty = 0;

  for (let i = 1; i <= 32; i++) {
    const s = slots[i];
    if (!s) continue;
    activeSlots++;
    const pCount = s.face1.length + s.face2.length + s.sacrifice.length;
    totalPrimitives += pCount;
    if (s.face1.length > 2 || s.face2.length > 2) complexityPenalty += 0.35;
    if (s.lifecycle === 1 || s.lifecycle === 2) complexityPenalty += 0.15;
    for (const inst of [...s.face1, ...s.face2, ...s.sacrifice]) {
      if (inst.conditionId !== 0) complexityPenalty += 0.1;
    }
  }
  const avgPrim = activeSlots > 0 ? totalPrimitives / activeSlots : 1;
  return Number((avgPrim + complexityPenalty / Math.max(1, activeSlots)).toFixed(3));
}

export function expandChassisConfigs(sweep: ChassisSweepConfig): ChassisConfig[] {
  const res: ChassisConfig[] = [];
  const nVal: ChassisConfig['N_Joueurs'] =
    sweep.N_Joueurs.length === 4 ? 'ALL' : sweep.N_Joueurs[0] ?? 'ALL';

  for (const pMax of sweep.P_Max) {
    for (const bout of sweep.Comportement_Bout_Rayon) {
      for (const seuil of sweep.Regle_Seuil_Gardiens) {
        for (const resAct of sweep.Seuil_Resonance_Activations) {
          for (const courbe of sweep.Courbe_Croissance_Nid) {
            for (const rev of sweep.Revision_Etape_2_2) {
              res.push({
                N_Joueurs: nVal,
                P_Max: pMax,
                Comportement_Bout_Rayon: bout,
                Regle_Seuil_Gardiens: seuil,
                Seuil_Resonance_Activations: resAct,
                Courbe_Croissance_Nid: courbe,
                Revision_Etape_2_2: rev,
              });
            }
          }
        }
      }
    }
  }
  return res;
}

export function buildVariantsForCampaign(
  chassisSweep: ChassisSweepConfig,
  patchSheet: PatchSheet,
  libraryItems: SlotLibraryItem[],
  maxVariants = 36,
): CompiledVariant[] {
  const chassisList = expandChassisConfigs(chassisSweep);

  // Merge baseline fallback for any missing slots 1..32
  const baseSlots = { ...BASELINE_PATCH_V4_6.slots, ...patchSheet.slots };

  // Expand $Sweep inside the patchSheet itself
  let patchInstances: {
    slots: Record<string, SlotDefinition>;
    params: Record<string, string | number | boolean>;
  }[] = [{ slots: baseSlots, params: {} }];

  for (const [slotId, slotDef] of Object.entries(baseSlots)) {
    const expanded = expandSlotSweeps(slotDef);
    if (expanded.length === 1) continue;
    const next: typeof patchInstances = [];
    for (const cur of patchInstances) {
      for (const exp of expanded) {
        next.push({
          slots: { ...cur.slots, [slotId]: exp.slot },
          params: { ...cur.params, ...exp.params },
        });
        if (next.length >= maxVariants) break;
      }
      if (next.length >= maxVariants) break;
    }
    patchInstances = next;
  }

  // Combinatorial addition from selected Library Slots (Section 3.4)
  if (libraryItems.length > 0) {
    // Group enabled library slots by targetSlotId so user can test alternative versions of slots
    const byTarget = new Map<string, SlotLibraryItem[]>();
    for (const item of libraryItems) {
      const list = byTarget.get(item.targetSlotId) ?? [];
      list.push(item);
      byTarget.set(item.targetSlotId, list);
    }

    for (const [targetId, items] of byTarget.entries()) {
      const options: {
        slot: SlotDefinition;
        params: Record<string, string | number | boolean>;
      }[] = [
        { slot: baseSlots[targetId], params: {} },
      ];
      for (const item of items) {
        for (const exp of expandSlotSweeps(item.slot)) {
          options.push({
            slot: exp.slot,
            params: { [`Lib(${targetId})`]: item.label, ...exp.params },
          });
        }
      }
      const next: typeof patchInstances = [];
      for (const cur of patchInstances) {
        for (const opt of options) {
          next.push({
            slots: { ...cur.slots, [targetId]: opt.slot },
            params: { ...cur.params, ...opt.params },
          });
          if (next.length >= maxVariants) break;
        }
        if (next.length >= maxVariants) break;
      }
      patchInstances = next;
    }
  }

  const variants: CompiledVariant[] = [];

  // Always include pure Baseline v4.6 as variant 0 for exact comparative Deltas
  const baselineCompiled: CompiledSlot[] = new Array(33);
  for (const slotDef of Object.values(BASELINE_PATCH_V4_6.slots)) {
    const cs = compileSlot(slotDef);
    if (cs.slotNumericId >= 1 && cs.slotNumericId <= 32) {
      baselineCompiled[cs.slotNumericId] = cs;
    }
  }

  const baseChassis: ChassisConfig = {
    N_Joueurs: chassisList[0]?.N_Joueurs ?? 'ALL',
    P_Max: 4,
    Comportement_Bout_Rayon: 'FRAPPE_SUR_PLACE',
    Regle_Seuil_Gardiens: 'ADAPTATIF_DISPO',
    Seuil_Resonance_Activations: 4,
    Courbe_Croissance_Nid: [
      { minInsects: 0, maxInsects: 1, spawn: 1 },
      { minInsects: 2, maxInsects: 99, spawn: 2 },
    ],
    Revision_Etape_2_2: true,
  };

  variants.push({
    variantId: 'V0_SOCLE_V4_6',
    label: 'Socle Référence v4.6',
    chassis: baseChassis,
    patchId: BASELINE_PATCH_V4_6.id,
    patchName: BASELINE_PATCH_V4_6.nom,
    sweepParams: {},
    slotsByNumericId: baselineCompiled,
    iccStatique: computeStaticIcc(baselineCompiled),
    isBaseline: true,
  });

  let idx = 1;
  for (const ch of chassisList) {
    for (const pi of patchInstances) {
      if (variants.length >= maxVariants) break;

      const compiledArr: CompiledSlot[] = new Array(33);
      for (const slotDef of Object.values(pi.slots)) {
        const cs = compileSlot(slotDef);
        if (cs.slotNumericId >= 1 && cs.slotNumericId <= 32) {
          compiledArr[cs.slotNumericId] = cs;
        }
      }

      const sweepSummary: Record<string, string | number | boolean> = {
        P_Max: ch.P_Max,
        Bout_Rayon: ch.Comportement_Bout_Rayon,
        Seuil_G: ch.Regle_Seuil_Gardiens,
        Rev_2_2: ch.Revision_Etape_2_2,
        ...pi.params,
      };

      const shortTags = [
        `P=${ch.P_Max}`,
        ch.Comportement_Bout_Rayon === 'FRAPPE_SUR_PLACE' ? 'Bout:SurPlace' : `Bout:${ch.Comportement_Bout_Rayon.slice(0, 8)}`,
        ch.Regle_Seuil_Gardiens === 'ADAPTATIF_DISPO' ? 'Seuil:Adapt' : `Seuil:${ch.Regle_Seuil_Gardiens.slice(0, 8)}`,
        ch.Revision_Etape_2_2 ? 'Rev2.2:ON' : 'Rev2.2:OFF',
        ...Object.entries(pi.params).map(([k, v]) => `${k.split('.').slice(-1)[0]}=${v}`),
      ];

      variants.push({
        variantId: `V${idx}`,
        label: `${patchSheet.mode === 'BASELINE' ? 'Châssis' : patchSheet.nom.slice(0, 22)} · ${shortTags.join(' | ')}`,
        chassis: ch,
        patchId: patchSheet.id,
        patchName: patchSheet.nom,
        sweepParams: sweepSummary,
        slotsByNumericId: compiledArr,
        iccStatique: computeStaticIcc(compiledArr),
        isBaseline: false,
      });
      idx++;
    }
  }

  return variants;
}
