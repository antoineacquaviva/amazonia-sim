import type {
  ChassisSweepConfig,
  PatchSheet,
  SlotDefinition,
  SlotLibraryItem,
} from './types.ts';
import { TILES_META } from './topology.ts';

export const DEFAULT_CHASSIS_SWEEP: ChassisSweepConfig = {
  N_Joueurs: [3, 4, 5, 6],
  P_Max: [4],
  Comportement_Bout_Rayon: ['FRAPPE_SUR_PLACE'],
  Regle_Seuil_Gardiens: ['FIXE_N'],
  Seuil_Resonance_Activations: [4],
  Courbe_Croissance_Nid: [
    [
      { minInsects: 0, maxInsects: 1, spawn: 1 },
      { minInsects: 2, maxInsects: 99, spawn: 2 },
    ],
  ],
  Revision_Etape_2_2: [true],
};

function buildBaselineSlots(): Record<string, SlotDefinition> {
  const slots: Record<string, SlotDefinition> = {};

  for (const t of TILES_META) {
    if (t.family === 'G') {
      slots[t.code] = {
        id_slot: t.code,
        nom: `Gardien Socle ${t.code} (${t.rowPeople}/${t.colPeople})`,
        description: 'Effet standard socle : réduction de seuil de parade de 1 sur la parcelle la plus menacée.',
        architecture_cycle_vie: 'SIMPLE_CONTINU',
        declencheur_cablage: 'LIBRE',
        effets: [
          {
            condition: 'AUCUNE',
            cible: 'PARCELLE_PLUS_MENACEE',
            primitive: 'MOD_SEUIL',
            valeur_X: 1,
            auto_parade_bool: false,
          },
        ],
      };
    } else if (t.family === 'R') {
      slots[t.code] = {
        id_slot: t.code,
        nom: `Rêve Socle ${t.code} (${t.rowPeople}/${t.colPeople})`,
        description: 'Effet standard socle : avance d\'1 cran vers la gauche si des arbres sont menacés.',
        effets: [
          {
            condition: 'SI_ARBRES_MENACES',
            cible: 'RANG_REVE_ACTIF',
            primitive: 'PERMUTATION_PISTE',
            direction: 'GAUCHE',
          },
        ],
      };
    } else {
      slots[t.code] = {
        id_slot: t.code,
        nom: `Nid Socle ${t.code} (${t.rowPeople}/${t.colPeople})`,
        description: 'Effet standard socle : génère ses Insectes de Châssis sur la parcelle du Nid.',
        effets: [
          {
            condition: 'AUCUNE',
            cible: 'PARCELLE_DU_NID',
            primitive: 'MOD_SEUIL',
            valeur_X: 1,
            auto_parade_bool: false,
          },
        ],
      };
    }
  }

  slots['INSECTE_BUG'] = {
    id_slot: 'INSECTE_BUG',
    nom: 'Bug du Cerveau (Socle)',
    description: 'Mode standard : réduit de 1 le seuil de Parade de la tactique colonisée.',
    parametres_insectes: {
      attachement: 'RANG_PHYSIQUE',
      hook_temporel: 'ETAPE_5_ATTAQUE',
      mode_consommation: 'PASSIF_CONTINU',
    },
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'TOUTES_PARCELLES_CIBLEES',
        primitive: 'MOD_SEUIL',
        valeur_X: 1,
        auto_parade_bool: false,
      },
    ],
  };

  slots['INSECTE_COLONIE'] = {
    id_slot: 'INSECTE_COLONIE',
    nom: 'Colonisation des Gardiens (Socle)',
    description: 'Mode standard : ouvre le Slot du Gardien dès l\'arrivée sur la case Déclencheur.',
    parametres_insectes: {
      attachement: 'CASE_DECLENCHEUR',
      hook_temporel: 'ETAPE_4_3_ARRIVEE',
      mode_consommation: 'CONSOMME_ONESHOT',
    },
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'GARDIEN_CIBLE_OU_LIBRE',
        primitive: 'PARTAGE_INFO_ETAT_GARDIEN',
        type_action: 'REACTIVER_GARDIEN',
      },
    ],
  };

  return slots;
}

export const BASELINE_PATCH_V4_6: PatchSheet = {
  id: 'baseline_v4_6',
  nom: 'Socle Standard v4.6',
  version: '4.6.0',
  mode: 'BASELINE',
  description:
    'Feuille de patch générique symétrique servant de référence (calibration du Châssis pur v4.6).',
  slots: buildBaselineSlots(),
};

function buildCustomSweepSlots(): Record<string, SlotDefinition> {
  const base = buildBaselineSlots();

  // Enrich G1..G15 with varied architectures (Double-Face, Sacrifice, Cascades)
  base['G1'] = {
    id_slot: 'G1',
    nom: 'Sentinelle des Mammifères (M/R)',
    description: 'Double-face : F1 réduit le seuil de 1, F2 réduit de 2 sur la parcelle la plus menacée.',
    architecture_cycle_vie: 'DOUBLE_FACE_UPGRADE',
    declencheur_cablage: 1,
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'MOD_SEUIL',
        valeur_X: 1,
        auto_parade_bool: false,
      },
    ],
    effets_face2: [
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'MOD_SEUIL',
        valeur_X: 2,
        auto_parade_bool: false,
      },
    ],
  };

  base['G3'] = {
    id_slot: 'G3',
    nom: 'Vigie de la Canopée (M/O)',
    description: 'Pose un Piège sur une parcelle menacée ou repousse une machine.',
    architecture_cycle_vie: 'SIMPLE_CONTINU',
    declencheur_cablage: 2,
    effets: [
      {
        condition: 'SI_ARBRES_MENACES',
        cible: 'PARCELLE_MACHINE_AVANCEE',
        primitive: 'DEPLACEMENT',
        deplacement_type: 'MACHINE_RECUL',
        amplitude: 1,
      },
    ],
  };

  base['G5'] = {
    id_slot: 'G5',
    nom: 'Grand Serpent Souterrain (R/O)',
    description: 'Sacrifice One-Shot : Auto-parade complète de la parcelle la plus menacée.',
    architecture_cycle_vie: 'SACRIFICE_ONESHOT',
    modalite_sacrifice: 'RENVOI_LISIERE',
    declencheur_cablage: 1,
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'MOD_SEUIL',
        valeur_X: 2,
        auto_parade_bool: false,
      },
    ],
    effets_sacrifice: [
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'MOD_SEUIL',
        valeur_X: 9,
        auto_parade_bool: true,
      },
    ],
  };

  base['G7'] = {
    id_slot: 'G7',
    nom: 'Éclaireur Chamane (H/M)',
    description: 'Partage d\'info et neutralisation de puissance machine.',
    architecture_cycle_vie: 'DOUBLE_FACE_UPGRADE',
    declencheur_cablage: 3,
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'MACHINE_PLUS_PUISSANTE',
        primitive: 'MOD_PUISSANCE',
        valeur_X: -1,
        bloquer_gain_etape5_bool: true,
      },
    ],
    effets_face2: [
      {
        condition: 'AUCUNE',
        cible: 'MACHINE_PLUS_PUISSANTE',
        primitive: 'MOD_PUISSANCE',
        valeur_X: -1,
        bloquer_gain_etape5_bool: true,
      },
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'CREATION_ENTITE',
        entite_type: 'PIEGE',
      },
    ],
  };

  base['G13'] = {
    id_slot: 'G13',
    nom: 'Esprit de la Ruche (I/M)',
    description: 'Résonance Insecte : crée 1 Insecte sur la parcelle menacée.',
    architecture_cycle_vie: 'SIMPLE_CONTINU',
    declencheur_cablage: 6,
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'CREATION_ENTITE',
        entite_type: 'INSECTE',
      },
    ],
  };

  // Rêve R1 & R3 with tactical cancellation + advance
  base['R1'] = {
    id_slot: 'R1',
    nom: 'Rêve Lucide (H/E)',
    description: 'Annule 1 jeton Apprentissage de la tactique en tête et avance d\'un cran.',
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'TACTIQUE_EN_TETE',
        primitive: 'MOD_APPRENTISSAGE',
        valeur_X: 1,
      },
      {
        condition: 'SI_ARBRES_MENACES',
        cible: 'RANG_REVE_ACTIF',
        primitive: 'PERMUTATION_PISTE',
        direction: 'GAUCHE',
      },
    ],
  };

  base['M1'] = {
    id_slot: 'M1',
    nom: 'Nid Symbiotique (M/I)',
    description: 'Génère un jeton Piège ou régénère 1 Souche sur le Nid.',
    effets: [
      {
        condition: 'SI_SOUCHES_PRESENTES',
        cible: 'PARCELLE_DU_NID',
        primitive: 'CREATION_ENTITE',
        entite_type: 'REPOUSSE_ARBRE',
      },
    ],
  };

  base['INSECTE_BUG'] = {
    id_slot: 'INSECTE_BUG',
    nom: 'Bug du Cerveau (Sweep Mode)',
    description: 'Teste la consommation court-circuit vs parasite continu à l\'Étape 6.',
    parametres_insectes: {
      attachement: 'TUILE',
      hook_temporel: 'ETAPE_6_APPRENTISSAGE',
      mode_consommation: { $Sweep: ['CONSOMME_ONESHOT', 'PASSIF_CONTINU'] },
    },
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'TACTIQUE_EN_TETE',
        primitive: 'MOD_APPRENTISSAGE',
        valeur_X: 1,
      },
    ],
  };

  return base;
}

export const CUSTOM_SWEEP_PATCH_01: PatchSheet = {
  id: 'custom_sweep_01',
  nom: 'Patch Thématique v4.6 + Sweep Insectes',
  version: '4.6.1',
  mode: 'CUSTOM',
  description:
    'Combine Gardiens Double-Face / Sacrifice, Rêve Lucide, Nid régénérant et un $Sweep sur le mode de consommation du Bug du Cerveau.',
  slots: buildCustomSweepSlots(),
};

export const DEFAULT_SLOT_LIBRARY: SlotLibraryItem[] = [
  {
    id: 'lib_g2_seuil_sweep',
    label: 'G2 — Rempart Évolutif (Seuil $Sweep [1, 2])',
    targetSlotId: 'G2',
    tags: ['Gardien', 'MOD_SEUIL', '$Sweep'],
    enabledForSweep: false,
    createdAt: '2026-11-12T10:00:00Z',
    slot: {
      id_slot: 'G2',
      nom: 'Rempart Évolutif (R/M)',
      description: 'Réduit le seuil de parade de X sur toutes les parcelles ciblées.',
      architecture_cycle_vie: 'SIMPLE_CONTINU',
      declencheur_cablage: 1,
      effets: [
        {
          condition: 'AUCUNE',
          cible: 'TOUTES_PARCELLES_CIBLEES',
          primitive: 'MOD_SEUIL',
          valeur_X: { $Sweep: [1, 2] },
          auto_parade_bool: false,
        },
      ],
    },
  },
  {
    id: 'lib_g4_sabotage_cascade',
    label: 'G4 — Saboteur Aérien (Crée Sabotage sur Décl. 1)',
    targetSlotId: 'G4',
    tags: ['Gardien', 'CREATION_ENTITE', 'Cascade'],
    enabledForSweep: false,
    createdAt: '2026-11-12T10:00:00Z',
    slot: {
      id_slot: 'G4',
      nom: 'Saboteur Aérien (O/M)',
      description: 'Génère une carte Sabotage (déclenche le Déclencheur 3 en cascade).',
      architecture_cycle_vie: 'SACRIFICE_ONESHOT',
      modalite_sacrifice: 'RETOUR_FACE_EPUISEE',
      declencheur_cablage: 1,
      effets: [
        {
          condition: 'AUCUNE',
          cible: 'PARCELLE_PLUS_MENACEE',
          primitive: 'MOD_SEUIL',
          valeur_X: 1,
        },
      ],
      effets_sacrifice: [
        {
          condition: 'AUCUNE',
          cible: 'LISIERE_VOISINE',
          primitive: 'CREATION_ENTITE',
          entite_type: 'SABOTAGE',
        },
      ],
    },
  },
  {
    id: 'lib_r3_decalage_m',
    label: 'R3 — Brouillard Onirique (Décalage dé M)',
    targetSlotId: 'R3',
    tags: ['Rêve', 'PERMUTATION_PISTE'],
    enabledForSweep: false,
    createdAt: '2026-11-12T10:00:00Z',
    slot: {
      id_slot: 'R3',
      nom: 'Brouillard Onirique (M/H)',
      description: 'Fait reculer la tactique en tête ou avance le Rêve d\'un cran.',
      effets: [
        {
          condition: 'AUCUNE',
          cible: 'RANG_REVE_ACTIF',
          primitive: 'PERMUTATION_PISTE',
          direction: 'GAUCHE',
        },
      ],
    },
  },
  {
    id: 'lib_colonie_sweep',
    label: 'Colonisation Gardiens — Hook & Mode $Sweep',
    targetSlotId: 'INSECTE_COLONIE',
    tags: ['Insecte', 'Colonisation', '$Sweep'],
    enabledForSweep: false,
    createdAt: '2026-11-12T10:00:00Z',
    slot: {
      id_slot: 'INSECTE_COLONIE',
      nom: 'Colonisation Adaptative',
      description: 'Compare le retournement F2 à l\'arrivée vs réactivation sur déclencheur.',
      parametres_insectes: {
        attachement: 'CASE_DECLENCHEUR',
        hook_temporel: { $Sweep: ['ETAPE_4_3_ARRIVEE', 'SUR_DECLENCHEUR'] },
        mode_consommation: 'CONSOMME_ONESHOT',
      },
      effets: [
        {
          condition: 'AUCUNE',
          cible: 'GARDIEN_CIBLE_OU_LIBRE',
          primitive: 'PARTAGE_INFO_ETAT_GARDIEN',
          type_action: 'FLIP_GARDIEN_F2',
        },
      ],
    },
  },
];
