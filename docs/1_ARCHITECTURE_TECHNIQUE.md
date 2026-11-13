# 1. Architecture Technique — Simulateur Amazonia (v4.6)

> **Statut du document** : Référence technique vivante — maintenue automatiquement à chaque évolution du code.  
> **Cible** : Auteur du jeu, développeurs et ingénieurs souhaitant comprendre les entrailles du moteur, le modèle mémoire et les flux de données.

---

## 1. Vue d'Ensemble de l'Architecture

Le simulateur est conçu comme une **application Full-Stack TypeScript** (React 19 + Express + Moteur de simulation embarqué à tableaux contigus), doublée d'un **exporteur de bundle Python/Numba** destiné aux campagnes massives sur Google Cloud Platform (Cloud Run Jobs / Cloud Batch).

L'architecture respecte un **découplage strict en trois couches indépendantes** :

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. COUCHE PRÉSENTATION & ATELIER (React 19 + Tailwind CSS v4)                │
│    ├─ ChassisCampaignView    : Paramétrage Grid Search & lancement           │
│    ├─ SlotLibraryView        : Éditeur visuel/JSON/YAML des 32 Slots         │
│    ├─ ResultsAxesView        : Leaderboard Pareto, 5 Axes, 30 Tuiles, Traces │
│    ├─ TopologyExplorerView   : Explorateur des 197/394 graphes & Matrice 6×6 │
│    └─ AiAnalystExportView    : Diagnostic Gemini & Export GitHub/GCP         │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ API REST JSON (/api/*)
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ 2. COUCHE ORCHESTRATION, PERSISTANCE & IA (Express / Node.js — server.ts)    │
│    ├─ Store Persistant Local : /data/store.json (Patchs, Bibliothèque, Runs) │
│    ├─ Compilateur de Patchs  : Expansion $Sweep → Bytecode Int16 (src/sim/)  │
│    ├─ Orchestrateur Monte-Carlo : CRN + State Forking + Smart Summarization  │
│    └─ Analyste IA Serveur    : @google/genai (gemini-4-hydrogen, JSON Schema)│
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ Appels directs en mémoire (Zero-I/O)
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ 3. MOTEUR DU CHÂSSIS INVARIABLE & VM DE SLOTS (Flat-Array TypeScript)        │
│    ├─ state.ts        : Modèle mémoire contigu (TypedArrays) + Xoshiro128++  │
│    ├─ topology.ts     : Énumérateur exact des 197 / 394 configurations       │
│    ├─ primitivesVm.ts : Machine Virtuelle des 7 Briques & Cascades 6-bits    │
│    ├─ bots.ts         : 3 Profils (Réflexe, Coopératif, Oracle) & Étape 2.2  │
│    └─ engine.ts       : Séquence invariable des 6 étapes + Repousse finale   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Organisation des Fichiers du Dépôt

| Chemin | Rôle et Responsabilité |
| :--- | :--- |
| `/server.ts` | Point d'entrée unique Full-Stack (port `3000`). Héberge les routes REST `/api/*`, la persistance locale dans `/data/store.json`, l'intégration serveur Gemini (`@google/genai`) et le middleware Vite. |
| `/src/sim/types.ts` | Contrat de typage complet : paramètres du Châssis, grammaire des Feuilles de Patch, objets `$Sweep`, télémétrie des 30 tuiles, structure des 5 axes et format du dossier transmis à l'IA. |
| `/src/sim/topology.ts` | Matrice officielle $6 \times 6$ des 30 tuiles de synergie et générateur combinatoire exact des **197 graphes sans miroir** et **394 configurations orientées** ($N \in \{3, 4, 5, 6\}$). |
| `/src/sim/state.ts` | Définition du `GameState` en tableaux typés contigus (`Int16Array`, `Int8Array`, `Uint32Array`), fonctions de clonage ultra-rapide (`cloneGameState`) et générateur pseudo-aléatoire déterministe **Xoshiro128++**. |
| `/src/sim/patchCompiler.ts` | Analyseur JSON/YAML, expanseur du produit cartésien des `$Sweep`, compilateur des Slots vers des instructions atomiques numériques et calculateur de l'indice de complexité lexicale ($ICC_{\text{statique}}$). |
| `/src/sim/primitivesVm.ts` | Machine virtuelle exécutant les **7 Briques Élémentaires**, gérant le cycle de vie des Gardiens (Simple, Upgrade F1→F2, Sacrifice) et la file binaire de cascades à 6 bits. |
| `/src/sim/bots.ts` | Implémentation des 3 profils de joueurs artificiels (`REFLEXE`, `COOPERATIF`, `ORACLE`), inférence bayésienne du 1er Défenseur (Étape 2.1) et boucle de révision muette (Étape 2.2). |
| `/src/sim/engine.ts` | Exécution pas-à-pas des 6 étapes d'un tour de jeu selon les règles v4.6, gestion des 3 conditions de fin de partie, phase de Repousse et capture d'état pour le *State Forking*. |
| `/src/sim/campaignRunner.ts` | Orchestrateur de campagne : boucle sur les variantes et les topologies avec graines contrôlées (*Common Random Numbers*), agrégation statistique sur les 5 axes, détection des *Red Flags* et génération des rapports. |
| `/src/sim/defaultPatches.ts` | Définition du **Socle Standard v4.6** (`baseline_v4_6`), du patch thématique de démonstration (`custom_sweep_01`) et de la bibliothèque initiale de Slots. |
| `/src/sim/gcpExporter.ts` | Générateur à la demande du bundle Python 3.12 + Numba (`Dockerfile`, `state.py`, `worker.py`, `deploy_cloud_run_job.sh`) pour l'exécution distribuée sur Google Cloud Run Jobs. |

---

## 3. Conception Bas-Niveau : Modèle Mémoire « Flat-Array » & Clonage Zero-Overhead

Pour permettre l'exécution de milliers de trajectoires Monte-Carlo et le clonage d'arbres de décision (*State Forking*) sans saturer le ramasse-miettes (*Garbage Collector*), l'état d'une partie (`GameState`) bannit les objets imbriqués dynamiques au profit de **tableaux numériques plats à taille fixe** (`TypedArray`) :

| Tableau (`GameState`) | Type & Dimensions | Contenu encodé |
| :--- | :--- | :--- |
| `meta` | `Int16Array(12)` | `[0]` $N$ joueurs, `[1]` $P_{\max}$, `[2]` Tour courant (1..8), `[3]` Étape (1..6), `[4]` Code de fin (`0`=En cours, `1`=Tour 8, `2`=Gardiens, `3`=Rêve), `[5]` Compteur Résonance, `[6]` Empilements de parade, `[7]` Total cascades, `[8]` Taille paquet Machine, `[9]` Sabotages en pile de côté, `[10]` Sabotages défaussés. |
| `forets` | `Int8Array(6 × 6 × 4)` | Pour chaque rayon $r \in [0..5]$ et profondeur $p \in [0..5]$ : `[0]` Arbres debout (0..3), `[1]` Souches (0..3), `[2]` Piège présent (0/1), `[3]` ID Tuile Nid `M` (0 ou 26..30). |
| `machines` | `Int8Array(6 × 2 × 4)` | Pour chaque rayon $r$ et type (`0`=Abatteuse, `1`=Bulldozer) : `[0]` Position $p$, `[1]` Jetons Puissance (0..8), `[2]` Tactique active ce tour (`0` ou `1..6`), `[3]` Gain de puissance bloqué (0/1). |
| `lisieresFurtivite` | `Int8Array(6 × 6 × 2)` | Par lisière $l$ et profondeur $p$ : `[0]` Défenseurs présents, `[1]` Insectes présents. |
| `tuilesLisiere` | `Int8Array(6 × 2 × 3)` | Pour les 2 emplacements de chaque lisière : `[0]` ID numérique Tuile (1..30), `[1]` Statut (`0`=En lisière, `1`=En jeu, `2`=Sacrifiée épuisée), `[2]` Défenseurs constructeurs. |
| `pisteTactiques` | `Int8Array(6 × 4)` | Rangs 1 à 6 (index `0..5`) : `[0]` ID Tuile (`1..6` pour `T1..T6`, `16..25` pour `R1..R10`), `[1]` Jetons Apprentissage, `[2]` Insectes attachés au Rang, `[3]` Insectes attachés à la Tuile. |
| `pisteGardiens` | `Int8Array(6 × 4)` | Cases Déclencheurs 1 à 6 : `[0]` ID Gardien (`0` ou `1..15`), `[1]` Face (`1` ou `2`), `[2]` Verrou anti-boucle du tour (`0/1`), `[3]` Insectes colonisateurs. |
| `parcelUnits` | `Int8Array(6 × 6 × 2)` | Par rayon $r$ et profondeur $p$ : `[0]` Défenseurs sur la parcelle, `[1]` Insectes sur la parcelle. |
| `parcelMods` | `Int8Array(6 × 6 × 2)` | Modificateurs temporaires du tour : `[0]` Réduction du seuil de Parade, `[1]` Auto-parade active (`0/1`). |
| `paquetMachines` | `Int8Array(32)` | Pile contiguë contenant les cartes Machine (`0..2N-1`) et les cartes Sabotage (`99`). |
| `tiragesSecrets` | `Int8Array(6 × 4)` | Derrière le mini-paravent du joueur $i$ : `[0]` Carte tirée, `[1]` Dé retenu $M = \min(D_1, D_2)$, `[2]` Masque d'info révélée, `[3]` Tactique sélectionnée. |
| `rngState` | `Uint32Array(4)` | État interne 128 bits du générateur pseudo-aléatoire **Xoshiro128++** embarqué dans l'état de la partie. |

### Pourquoi embarquer `rngState` dans `GameState` ?
Lorsqu'on clone une partie au début de l'Étape 2 pour le *State Forking* (`cloneGameState`), les 4 clones héritent **exactement des mêmes 128 bits d'état aléatoire** (`rngState`). Ainsi, aux tours suivants, les lancers de dés 2D6 et les mélanges de paquets restent strictement identiques entre les branches comparées, isolant l'impact pur de la décision tactique.

---

## 4. Compilation des Feuilles de Patch vers Bytecode & File de Cascades

### 4.1. Du JSON/YAML au Bytecode `CompiledInstruction`
Plutôt que d'évaluer des chaînes de caractères ou de parcourir des arbres JSON pendant la boucle de simulation, `patchCompiler.ts` effectue deux opérations avant le lancement d'une campagne :
1. **Expansion du Produit Cartésien (`$Sweep`)** : Détecte récursivement toutes les clés contenant `{"$Sweep": [v1, v2, ...]}` dans la Feuille de Patch et dans les Slots sélectionnés de la Bibliothèque, puis génère une instance de variante (`CompiledVariant`) par combinaison.
2. **Encodage Numérique** : Traduit chaque effet atomique en un tuple de 6 entiers (`primitiveId`, `targetSelectorId`, `param1`, `param2`, `conditionId`, `hookId`).

### 4.2. Exécution Vectorisée des Cascades (Masque 6-bits)
La Piste des Gardiens comporte 6 Déclencheurs numérotés de 1 à 6 :
- `1`: Parade réussie (Étape 5)
- `2`: Piège posé (Étape 4.1 ou primitive)
- `3`: Sabotage gagné (Étape 4.1 ou primitive)
- `4`: Gardien / Résonance (pose ou ouverture d'un autre Gardien)
- `5`: Rêve (pose en 3.1 ou activation en 3.2)
- `6`: Insecte (pose d'un Nid en 3.1, activation d'un Nid en 4.2 ou création d'Insecte)

Le moteur maintient un entier `triggersQueueMask` (masque binaire sur 6 bits). Dès qu'un événement allume le déclencheur $d \in \{1..6\}$, le bit $(d-1)$ passe à `1`.  
La fonction `resolveGardienCascades` dépile les bits actifs tant que `triggersQueueMask !== 0` :
- Elle vérifie le verrou anti-boucle `pisteGardiens[trigIdx * 4 + 2] === 0` (**règle stricte v4.6 : 1 ouverture maximum par tuile Gardien et par tour**).
- Elle incrémente les compteurs de télémétrie et de cascade ($ICC_{\text{cascade}}$).
- Elle exécute l'effet selon l'architecture de cycle de vie du Gardien (`SIMPLE_CONTINU`, `DOUBLE_FACE_UPGRADE` ou `SACRIFICE_ONESHOT`), puis allume le bit du **Déclencheur 4 (Résonance)** si la tuile ouverte n'est pas elle-même sur la case 4.

---

## 5. Persistance & API REST Serveur

Le serveur Express (`server.ts`) expose les endpoints suivants sur le port `3000` :

- `GET /api/bootstrap` : Charge l'état complet (Patchs sauvegardés, Bibliothèque de Slots, historique des campagnes) depuis `/data/store.json`.
- `GET /api/topologies?oriented=false|true` : Retourne les 197 graphes sans miroir ou les 394 configurations orientées avec leur signature asymétrique.
- `POST /api/slots` & `DELETE /api/slots/:id` : Ajoute, met à jour ou supprime un Slot dans la Bibliothèque persistante (accepte du JSON ou du YAML).
- `POST /api/patches` : Enregistre ou importe une Feuille de Patch complète.
- `POST /api/campaigns/run` : Exécute une campagne complète et sauvegarde les résultats dans `/data/store.json`.
- `POST /api/analyze` : Transmet le dossier condensé (`SmartSummaryPayload`) au modèle `gemini-4-hydrogen` via le SDK `@google/genai` (avec `responseSchema` strict) et renvoie un diagnostic en 5 points accompagné d'une Feuille de Patch corrective complète.
- `POST /api/export/gcp` : Génère le bundle de fichiers Python/Numba + Docker + script `gcloud` pour exécution massive sur Google Cloud Platform.
