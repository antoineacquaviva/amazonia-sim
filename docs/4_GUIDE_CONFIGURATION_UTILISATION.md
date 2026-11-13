# 4. Guide de Configuration et d'Utilisation — Simulateur Amazonia (v4.6)

> **Statut du document** : Manuel utilisateur vivant — maintenu automatiquement à chaque évolution de l'interface ou de la grammaire de patch.  
> **Cible** : Auteur du jeu utilisant le simulateur au quotidien pour concevoir ses tuiles, tester ses hypothèses d'équilibrage et interpréter les résultats.

---

## 1. Prise en Main Rapide (En 3 Minutes)

L'interface est organisée autour d'une barre de navigation supérieure à **5 onglets** correspondant aux étapes naturelles de votre travail d'équilibrage :

1. **Campagne** : Réglez les paramètres du Châssis (nombre de joueurs, longueur des pistes, règles en suspens), choisissez votre Feuille de Patch et cliquez sur **Lancer la campagne**.
2. **Slots & Patchs** : Modifiez les effets des 30 tuiles (`G1–G15`, `R1–R10`, `M1–M5`) et des 2 Slots d'Insectes, ajoutez des valeurs à balayer avec `$Sweep`, ou importez des créations issues de vos autres discussions Gemini.
3. **Résultats 5 Axes** : Consultez le classement des variantes (Leaderboard Pareto), les alertes automatiques (*Red Flags*), la matrice de santé des 30 tuiles et le récit tour par tour de 3 parties types.
4. **Topologies** : Explorez les 197 configurations de table sans miroir (ou 394 orientées) et vérifiez la matrice officielle $6 \times 6$ des Tuiles de Synergie.
5. **Analyste IA** : Demandez à Gemini d'analyser scientifiquement votre campagne et d'engendrer une nouvelle Feuille de Patch corrective testable en un clic, ou exportez vos rapports (`.md`, `.json`).

---

## 2. Configurer le Châssis et le Balayage en Grille (Onglet « Campagne »)

Tous les boutons du **Vecteur de Configuration du Châssis** acceptent la **multi-sélection** : si vous activez simultanément deux ou trois options d'un même paramètre, le simulateur génère automatiquement toutes les variantes correspondantes pour les comparer face au **Socle Référence v4.6 (`V0_SOCLE_V4_6`)**.

### 2.1. Paramètres du Châssis disponibles
- **`N_Joueurs` (`3J`, `4J`, `5J`, `6J`)** : Sélectionnez les tailles de table à inclure dans la campagne.
- **`P_Max` (`P=3`, `P=4`, `P=5`)** : Nombre de parcelles par piste Forêt de la périphérie ($p=1$) jusqu'au cœur ($p=P_{\max}$). Plus $P_{\max}$ est petit, plus les machines atteignent rapidement le centre et plus les Insectes migrent vite vers les pistes globales.
- **`Comportement_Bout_Rayon`** (Que fait une machine déjà en $P_{\max}$ lorsqu'elle joue `T2, T3, T5, T6` ?) :
  - *Frappe sur place* : `T2/T5` frappent $P_{\max}$ ; `T3/T6` frappent deux fois $P_{\max}$.
  - *Frappe à vide devant* : La frappe en $P_{\max}+1$ est perdue, seule la frappe en $P_{\max}$ s'applique.
  - *Dégât cœur adjacent* : Toute frappe au-delà de $P_{\max}$ coupe 1 Arbre debout sur la parcelle centrale $P_{\max}$ du rayon voisin.
  - *Boucle voisin* : La frappe au-delà de $P_{\max}$ cible directement la parcelle $P_{\max}$ du voisin.
- **`Regle_Seuil_Gardiens`** (Condition déclenchant l'arrêt anticipé *Réveil de la Forêt*) :
  - *Fixe ($N$ tuiles)* : Règle du socle provisoire v4.6 (requiert exactement $N$ tuiles Gardien sur la piste).
  - *Adaptatif dispo* : Seuil ajusté à $\max(2, \min(N, \text{nb tuiles G disponibles en lisière}))$ pour ne pas pénaliser les tables ayant peu de Peuples Animaux Sauvages.
  - *Compteur Résonance* : Victoire dès que le seuil est atteint **OU** dès que le Déclencheur 4 a été activé $K$ fois.
- **Boucle de révision muette (Étape 2.2)** : Permet de comparer le jeu avec ou sans la phase d'ajustement du 2e Défenseur (*En réflexion* $\rightarrow$ *Définitif*) afin de quantifier $\Delta_{\text{Réflexion}}$.

### 2.2. Choix de la Couverture Topologique et du Volume Monte-Carlo
- **Stratifié (48)** : Échantillon équilibré couvrant proportionnellement 3, 4, 5 et 6 joueurs et tous les régimes de table. Idéal pour itérer en moins d'une seconde.
- **Exact 197** : Parcourt l'intégralité des 197 graphes de voisinage sans miroir. Recommandé pour valider un patch avant impression ou test physique.
- **Orienté 394** : Teste également l'inversion gauche/droite autour de la table.
- **Activer le State Forking** : Lorsque cette case est cochée, le moteur clone un sous-échantillon de parties en 4 branches au début de l'Étape 2 pour mesurer la valeur marginale $\Delta V$ (en % d'arbres sauvés) de chaque tuile.

---

## 3. Concevoir des Slots et des Feuilles de Patch (Onglet « Slots & Patchs »)

### 3.1. Structure Déclarative d'un Slot (JSON ou YAML)
Chaque Slot (`G1` à `G15`, `R1` à `R10`, `M1` à `M5`, `INSECTE_BUG`, `INSECTE_COLONIE`) s'écrit en combinant exclusivement les concepts de la section 4 des règles v4.6 :

```json
{
  "id_slot": "G1",
  "nom": "Sentinelle des Mammifères (M/R)",
  "description": "Double-face : F1 réduit le seuil de 1, F2 réduit de 2 ou 3.",
  "architecture_cycle_vie": "DOUBLE_FACE_UPGRADE",
  "declencheur_cablage": 1,
  "effets": [
    {
      "condition": "AUCUNE",
      "cible": "PARCELLE_PLUS_MENACEE",
      "primitive": "MOD_SEUIL",
      "valeur_X": 1,
      "auto_parade_bool": false
    }
  ],
  "effets_face2": [
    {
      "condition": "AUCUNE",
      "cible": "PARCELLE_PLUS_MENACEE",
      "primitive": "MOD_SEUIL",
      "valeur_X": { "$Sweep": [2, 3] },
      "auto_parade_bool": false
    }
  ]
}
```

### 3.2. Référentiel des Valeurs Autorisées dans la Grammaire

| Champ | Valeurs possibles |
| :--- | :--- |
| **`id_slot`** | `G1`..`G15`, `R1`..`R10`, `M1`..`M5`, `INSECTE_BUG`, `INSECTE_COLONIE` |
| **`architecture_cycle_vie`** *(Gardiens)* | `SIMPLE_CONTINU` \| `DOUBLE_FACE_UPGRADE` (utilise `effets_face2`) \| `SACRIFICE_ONESHOT` (utilise `effets_sacrifice`) |
| **`modalite_sacrifice`** *(Gardiens)* | `RETOUR_FACE_EPUISEE` (reste inerte) \| `RENVOI_LISIERE` (retourne en lisière, reconstructible) |
| **`declencheur_cablage`** *(Gardiens)* | `"LIBRE"` ou un entier `1` à `6` (indique au bot quel Déclencheur privilégier lors de la pose en 3.1) |
| **`parametres_insectes.attachement`** | `RANG_PHYSIQUE` \| `TUILE` \| `CASE_DECLENCHEUR` |
| **`parametres_insectes.hook_temporel`** | `ETAPE_3_2_REVELATION` \| `ETAPE_4_3_ARRIVEE` \| `ETAPE_5_ATTAQUE` \| `ETAPE_6_APPRENTISSAGE` \| `SUR_DECLENCHEUR` |
| **`parametres_insectes.mode_consommation`** | `CONSOMME_ONESHOT` (défaussé après effet) \| `PASSIF_CONTINU` (reste en place) |
| **`condition`** | `AUCUNE` \| `SI_ARBRES_MENACES` \| `SI_DE_M_PAIR` \| `SI_DE_M_IMPAIR` \| `SI_REVE_EN_JEU` \| `SI_INSECTE_SUR_PISTE` \| `SI_SOUCHES_PRESENTES` |
| **`cible`** | `PARCELLE_PLUS_MENACEE` \| `PARCELLE_MACHINE_AVANCEE` \| `PARCELLE_DU_NID` \| `TOUTES_PARCELLES_CIBLEES` \| `LISIERE_VOISINE` \| `RANG_DU_DE_M` \| `RANG_REVE_ACTIF` \| `TACTIQUE_EN_TETE` \| `GARDIEN_CIBLE_OU_LIBRE` \| `MACHINE_PLUS_PUISSANTE` |
| **`primitive`** *(Les 7 Briques)* | 1. `MOD_SEUIL` (`valeur_X`, `auto_parade_bool`)<br>2. `CREATION_ENTITE` (`entite_type`: `PIEGE` \| `INSECTE` \| `SABOTAGE` \| `REPOUSSE_ARBRE`)<br>3. `DEPLACEMENT` (`deplacement_type`: `DEFENSEUR` \| `PIEGE` \| `INSECTE` \| `MACHINE_RECUL`, `amplitude`)<br>4. `MOD_PUISSANCE` (`valeur_X`: `-1`, `bloquer_gain_etape5_bool`)<br>5. `MOD_APPRENTISSAGE` (`valeur_X`: jetons retirés)<br>6. `PERMUTATION_PISTE` (`direction`: `GAUCHE` \| `DROITE`, `decalage_lecture_de_M`)<br>7. `PARTAGE_INFO_ETAT_GARDIEN` (`type_action`: `REVELER_MACHINE` \| `REVELER_DE_M` \| `FLIP_GARDIEN_F2` \| `REACTIVER_GARDIEN`) |

### 3.3. Utiliser l'opérateur `$Sweep` et la Bibliothèque de Slots
- **Balayage interne `$Sweep`** : N'importe quel champ d'un Slot peut être remplacé par `{"$Sweep": [option1, option2]}`. Le compilateur génère automatiquement une variante par combinaison.
- **Bibliothèque de Slots** :
  1. Dans l'onglet **Slots & Patchs**, éditez un Slot (ou collez un JSON/YAML dans le panneau d'import) puis cliquez sur **Enregistrer dans la Bibliothèque**.
  2. De retour dans l'onglet **Campagne**, activez **Combinatoire Bibliothèque de Slots (§3.4)** et cochez les Slots que vous souhaitez mettre en compétition avec le patch actif.

---

## 4. Lire et Interpréter les Résultats (Onglet « Résultats 5 Axes »)

- **Leaderboard & Front de Pareto** :
  - Une variante est marquée **Optimal** (Front de Pareto) si aucune autre variante de la campagne n'est simultanément plus équilibrée ($\sigma_{\text{topos}}$ plus bas), plus riche en coopération ($\Delta_{\text{Coop}}$ plus haut) et plus légère cognitivement ($ICC$ plus bas).
  - Cliquez sur n'importe quelle ligne du tableau pour mettre à jour tous les graphiques et matrices de la page sur cette variante.
- **Journal des Anomalies (*Red Flags*)** :
  - S'affiche automatiquement en haut des résultats dès qu'un seuil critique est franchi :
    - *Alerte Snowball* : $> 10\%$ de fins anticipées dès les tours 1 à 4.
    - *Saturation* : $> 80\%$ des parties se terminent par la même voie.
    - *Tuile morte* ($< 10\%$ de construction quand disponible) ou *Tuile obligatoire* ($> 90\%$).
    - *Bris de symétrie topologique* : configurations s'écartant de plus de $2\sigma$ du score moyen.
- **Matrice de Santé des 30 Tuiles & $\Delta V$ State Forking** :
  - **Pick Rate** : Fréquence à laquelle les bots choisissent de bâtir la tuile lorsqu'elle est présente sur une lisière de la table.
  - **$\Delta V$ Forking** : Gain marginal pur (en points de % d'arbres sauvés) mesuré en forçant la construction de la tuile sur un clone exact de la partie. Une tuile avec un *Pick Rate* faible mais un $\Delta V$ très positif est sous-évaluée ; une tuile avec un $\Delta V$ négatif ralentit la défense par rapport à l'effort de pose des 2 Défenseurs.
- **Traces Narratives Contrastées** :
  - Permet de lire tour par tour (`T1` à `T8`) ce qui s'est réellement passé sur le plateau dans la **Partie médiane**, la **Victoire à l'arraché** et l'**Effondrement**.

---

## 5. Boucle d'Amélioration Continue avec l'Analyste IA

Dans l'onglet **Analyste IA** :
1. Cliquez sur **Lancer le Diagnostic IA**. Le serveur transmet le Dossier de Synthèse condensé à Gemini (`gemini-4-hydrogen`).
2. Gemini rédige un diagnostic structuré (équilibre des 3 fins, coopération muette, tuiles critiques, recommandations prioritaires) et génère **une Feuille de Patch corrective complète**.
3. Cliquez sur **Injecter et tester ce Patch Correctif** : le nouveau patch est automatiquement sélectionné dans l'onglet **Campagne**, prêt à être simulé face au Socle v4.6 pour vérifier immédiatement si les anomalies (*Red Flags*) ont disparu.
