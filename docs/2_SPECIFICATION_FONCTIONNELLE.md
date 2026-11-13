# 2. Spécification Fonctionnelle Générale — Simulateur Amazonia (v4.6)

> **Statut du document** : Référence fonctionnelle et algorithmique vivante — maintenue automatiquement à chaque évolution de l'application.  
> **Cible** : Auteur du jeu et game designers souhaitant vérifier la conformité aux règles v4.6, le déroulement d'une simulation et les principes mathématiques d'évaluation.

---

## 1. Objectif et Périmètre Fonctionnel

Le **Simulateur Amazonia** est un laboratoire d'équilibrage conçu pour tester, calibrer et valider le jeu coopératif asymétrique **Amazonia : Dernier Rempart (version 4.6)**. Il répond à trois besoins :

1. **Valider le Châssis Invariable (v4.6)** : Tester l'impact des paramètres globaux encore ouverts (longueur des pistes $P_{\max}$, comportement d'une machine en bout de rayon $P_{\max}$, règle du seuil de victoire des Gardiens, courbe des Nids et valeur de la révision muette à l'Étape 2.2).
2. **Concevoir et Calibrer les 32 Slots Modulaires** : Injecter des effets déclaratifs pour les **30 Tuiles de Synergie** (`G1–G15`, `R1–R10`, `M1–M5`) et les **2 Slots d'Insectes** (`Bug du Cerveau`, `Colonisation des Gardiens`) en assemblant les **7 Briques Élémentaires** et en balayant automatiquement leurs valeurs numériques ou structurelles via l'opérateur `$Sweep`.
3. **Identifier les Déséquilibres sans Angle Mort** : Simuler les variantes sur l'ensemble des **197 configurations de table sans miroir** (ou 394 orientées) de 3 à 6 joueurs, comparer 3 profils cognitifs de bots, mesurer la valeur marginale $\Delta V$ de chaque tuile par clonage d'état (*State Forking*) et synthétiser les résultats sur 5 axes de notation.

---

## 2. Conformité à la Règle du Jeu (v4.6)

### 2.1. Topologie de la Roue et Matrice des 30 Tuiles
Autour du plateau central alternent $N$ pistes Forêt (numérotées de l'extérieur $p=1$ vers le cœur $p=P_{\max}$) et $N$ pistes Furtivité (les Lisières). Chaque lisière séparant deux Peuples voisins $(X, Y)$ reçoit exactement les 2 tuiles symétriques $(X, Y)$ et $(Y, X)$ issues de la matrice officielle $6 \times 6$ :
- **Gardiens (`G1` à `G15`)** : 6 tuiles intra-animales (`G1–G6` entre Mammifères `M`, Reptiles `R`, Oiseaux `O`) et 9 tuiles inter-regroupements (`G7–G15`).
- **Rêves (`R1` à `R10`)** : 2 tuiles intra-oniriques (`R1–R2` entre Humains `H` et Entités Magiques `E`) et 8 tuiles inter-regroupements (`R3–R10`).
- **Croissance / Nids (`M1` à `M5`)** : 5 tuiles symbiotiques associant les Insectes (`I`) aux 5 autres Peuples.

### 2.2. Les 6 Étapes d'un Tour de Jeu
À chaque tour (maximum 8 tours), le moteur exécute dans l'ordre strict :

1. **Étape 1 — Plan Secret (Derrière le mini-paravent)** :
   - Chaque joueur pioche 1 carte du paquet Machine (contenant les $2N$ machines + les cartes Sabotage accumulées). Le reste du paquet est mis de côté sans être consulté.
   - Chaque joueur lance 2D6 et retient le minimum : $M = \min(D_1, D_2)$ (probabilités : Rang 1 = $11/36$, Rang 2 = $9/36$, ..., Rang 6 = $1/36$).
   - Si la carte tirée est une Machine et que le rang $M$ sur la Piste des Tactiques centrale est occupé par une Tactique (`T1` à `T6`), celle-ci est sélectionnée en secret. Si le joueur a tiré un Sabotage ou si le rang $M$ contient un Rêve, aucune tactique ne s'applique.
2. **Étape 2 — Placement Muet des Défenseurs** :
   - **2.1 Premier Défenseur (Ancrage local irrévocable)** : Posé uniquement sur la piste Forêt du joueur ou sur l'une de ses deux pistes Furtivité adjacentes (case Furtivité ou Tuile de Synergie).
   - **2.2 Deuxième Défenseur (Soutien global avec révision)** : Posé sur n'importe quel emplacement du plateau sur sa face *« en réflexion »*, puis ajusté silencieusement (résolution des pions isolés *orphelins* ou des *surcharges*) avant d'être verrouillé sur sa face *« définitive »*.
3. **Étape 3 — Construction des Tuiles & Révélation** :
   - **3.1 Construction immédiate** : Toute Tuile de Synergie en lisière accueillant un binôme (2 Défenseurs quelconques) entre en jeu :
     - **Gardien (`G1–G15`)** : Branché sur une case Déclencheur libre (1 à 6) en Face 1. Active en résonance le Déclencheur 4 s'il est occupé. Les 2 Défenseurs restent sur la case de lisière jusqu'à la fin du tour.
     - **Rêve (`R1–R10`)** : Inséré par poussée au **Rang 6** (tout à droite) de la Piste des Tactiques, poussant d'un cran vers la gauche les Rêves déjà présents aux derniers rangs et éjectant la tuile Tactique la plus à droite. Active le Déclencheur 5.
     - **Croissance (`M1–M5`)** : Posé sous forme de Nid sur une parcelle sans machine contenant au moins 1 pion (Arbre ou Souche) de l'un des deux rayons associés. Active le Déclencheur 6. **Les 2 Défenseurs constructeurs suivent immédiatement la tuile sur la parcelle Forêt du Nid** (pour l'activer en 4.2 et défendre en 5).
   - **3.2 Révélation** :
     - Une carte Sabotage piochée annule l'activation et retourne dans la réserve générale.
     - Un dé $M$ pointant sur un Rêve (y compris un Rêve posé en 3.1) annule l'attaque de la machine, ouvre le Slot du Rêve et active le Déclencheur 5.
     - Sinon, la paire Machine + Tactique (`T1–T6`) cible la ou les parcelles correspondantes.
4. **Étape 4 — Furtivité, Nids de Croissance & Migration des Insectes** :
   - **4.1 Binômes en Furtivité** : Formés par **2 Défenseurs** OU **1 Défenseur + 1 Insecte (l'Insecte étant alors défaussé)**. Sur chacune des deux parcelles Forêt en face :
     - Si la parcelle est **sans machine et non ciblée ce tour-ci** : pose 1 jeton Piège (max 1/parcelle, Déclencheur 2).
     - Si la parcelle contient **au moins une machine mais aucune machine active ce tour-ci** : gagne 1 carte Sabotage placée sur la pile mise de côté (Déclencheur 3).
   - **4.2 Activation des Nids** : Tout Nid occupé par au moins 1 Défenseur génère des Insectes selon la courbe de croissance paramétrée et ouvre son Slot continu (Déclencheur 6).
   - **4.3 Déplacement & Migration ($P_{\max}$)** : Chaque Insecte peut bouger d'1 cran. Depuis $P_{\max}$, il peut quitter la roue pour coloniser la Piste des Tactiques (**Slot Bug du Cerveau**) ou la Piste des Gardiens (**Slot Colonisation des Gardiens**).
5. **Étape 5 — Résolution des Attaques des Machines** :
   - **Seuil de Parade** : Pour chaque parcelle ciblée contenant au moins 1 pion :
     $$\text{Seuil} = \max\big(1,\; (\text{Arbres} + \text{Souches}) + \text{Puissance} + \text{Modificateur de Tactique} - \text{Réductions Slots}\big)$$
     Modificateurs des tactiques : `T1/T2` = $0$, `T3/T4/T5` = $-1$, `T6` = $-2$. Un Piège pare automatiquement toutes les frappes sur sa parcelle ce tour-ci. Chaque Défenseur et chaque Insecte présent apporte $+1$ en défense contre toutes les machines ciblant la parcelle. Toute frappe parée allume le Déclencheur 1.
   - **Ordre strict** : **1. Abatteuses** (1 Arbre debout $\rightarrow$ 1 Souche) puis **2. Bulldozers** (retire **toutes** les Souches de la parcelle, y compris celle qu'une Abatteuse vient de créer).
   - **Finalisation** : Retrait des Pièges déclenchés et des **Insectes ayant participé à une Parade sur une parcelle attaquée** ; avancée ($p \rightarrow p+1$) des machines en `T3/T6` (détruisant tout Nid présent sur la parcelle d'arrivée et renvoyant la tuile `M` en lisière) ; gain de $+1$ Puissance permanente pour `T4/T5/T6`.
6. **Étape 6 — Apprentissage du Contremaître & Fin de Tour** :
   - Chaque Tactique jouée reçoit **+1 jeton Apprentissage par parcelle endommagée** (max 1 par parcelle ciblée) et **+1 jeton si sa machine a gagné de la Puissance** (`T4/T5/T6`).
   - Si une tuile Tactique est **strictement seule en tête**, elle échange sa place avec sa voisine de gauche ($\text{Rang } r \rightarrow r-1$), pouvant ainsi faire reculer un Rêve d'un cran vers la droite.
   - Récupération des Défenseurs et **mélange unique** de toutes les cartes Machine avec les cartes Sabotage non piochées et nouvellement acquises.

### 2.3. Conditions de Fin de Partie et Repousse Finale
Le chantier s'arrête dès que :
1. **Réveil de la Forêt (Gardiens)** : Le seuil requis de tuiles Gardien sur la piste est atteint.
2. **Sommeil du Contremaître (Rêve)** : Une tuile Rêve atteint le **Rang 1** (tout à gauche) de la Piste des Tactiques.
3. **Fin du contrat (Tour 8)** : La fin de l'Étape 6 du 8e tour est atteinte.

Lors de la **Repousse finale**, sur chaque parcelle contenant encore au moins une Souche, **une seule Souche** est retournée sur sa face Arbre debout. Le score de l'équipe est le total des Arbres debout sur la roue (exprimé en valeur absolue et en pourcentage des $3 \times N \times P_{\max}$ arbres initiaux).

---

## 3. Workflow d'une Campagne de Simulation

```
[1. Paramétrage Châssis + Patch + Bibliothèque de Slots]
                         │
                         ▼
[2. Expansion Cartésienne des $Sweep & Compilation Bytecode]
                         │
                         ▼
[3. Sélection Topologique : 48 stratifiées | 197 sans miroir | 394 orientées]
                         │
                         ▼
[4. Boucle Monte-Carlo à Graines Contrôlées (Common Random Numbers)]
    ├─ Profil 1 : Bot Réflexe / Myope (Sans déduction ni révision 2.2)
    ├─ Profil 2 : Bot Coopératif Heuristique (Inférence 2.1 + Révision 2.2)
    ├─ Profil 3 : Bot Oracle Omniscient (Information ouverte)
    └─ Sous-échantillon State Forking : 4 clones partageant le même rngState
                         │
                         ▼
[5. Calcul des 5 Axes, Front de Pareto, Clustering & Détection des Red Flags]
                         │
                         ▼
[6. Smart Summarization (< 30k tokens) ──> Analyste IA Gemini ──> Patch Correctif]
```

---

## 4. Principes et Choix Algorithmiques

### 4.1. Énumération Topologique Exacte (197 / 394 Configurations)
Pour $N \in \{3, 4, 5, 6\}$ joueurs choisis parmi les 6 Peuples $\{M, R, O, H, E, I\}$ :
- Il existe $\binom{6}{N}$ groupes de peuples, et $(N-1)!$ placements circulaires orientés à rotation près (soit **394 configurations orientées**).
- Comme chaque lisière met en jeu la paire symétrique $\{(X,Y), (Y,X)\}$, inverser le sens du cercle (symétrie miroir) produit exactement le même lot de $2N$ tuiles. Il existe donc exactement $\binom{6}{N} \times \frac{(N-1)!}{2}$ graphes de voisinage purs (avec cas particulier $N=3$ où les 3 peuples sont tous mutuellement voisins), soit **197 configurations sans miroir**.
- Chaque configuration est automatiquement qualifiée par sa **Signature Asymétrique** (`nbG`, `nbR`, `nbM`, paires `intraAnimal`, paires `intraOnirique`) et classée dans l'un des **Régimes de Table** (*Animaux Sauvages dominants*, *Onirique dominante*, *Alternée Symbiotique*, *Alternée pure*, *Mixte équilibrée*).

### 4.2. Modélisation des 3 Profils de Bots & Inférence Muette
L'écart de performance entre les trois bots permet d'isoler mathématiquement la valeur de la coopération silencieuse :
1. **Bot « Réflexe / Myope »** :
   - Pose son 1er Défenseur sur sa forêt si sa propre carte secrète la menace, sinon sur une lisière adjacente.
   - Pose son 2e Défenseur sans décoder les signaux de ses alliés et **sans boucle de révision** à l'Étape 2.2.
2. **Bot « Coopératif Heuristique » (Cible Design Humain)** :
   - **Signal Bayésien à l'Étape 2.1** : Interprète la pose du 1er Défenseur de chaque voisin. Si un joueur pose son 1er Défenseur sur une parcelle de sa propre forêt, la probabilité estimée qu'une machine frappe cette parcelle augmente fortement ($+6.5$ d'utilité défensive). Inversement, s'il pose son 1er Défenseur en lisière alors que ses machines sont sur sa forêt, la menace estimée sur son rayon est réduite ($\times 0.6$).
   - **Boucle de Convergence à l'Étape 2.2 (`En réflexion` $\rightarrow$ `Définitif`)** : Jusqu'à 3 rondes de révision. À chaque ronde, les bots détectent les conflits de coordination publics :
     - *Orphelins* : un unique Défenseur isolé sur une Tuile de Synergie ou une case Furtivité sans Insecte (qui serait gaspillé à l'Étape 3/4).
     - *Overkills* : 3 Défenseurs ou plus sur un emplacement qui n'en requiert que 2.
     Les joueurs réallouent leur 2e Défenseur jusqu'à convergence.
3. **Bot « Oracle / Omniscient »** :
   - Connaît dès l'Étape 2 les cartes Machine et les dés $M$ de tous les joueurs. Il alloue exactement le nombre de Défenseurs requis pour atteindre le seuil de Parade sans aucun gaspillage.

### 4.3. *Common Random Numbers* (CRN) & *State Forking*
- **Common Random Numbers (CRN)** : Pour une configuration topologique `topo.id` et un indice de répétition $k$, la graine aléatoire initiale est calculée de façon déterministe :
  $$\text{seed}_{topo, k} = (\text{baseSeed} + \text{topo.id} \times 1009 + k \times 7919) \bmod 2^{32}$$
  Ainsi, la Variante A et la Variante B affrontent **exactement les mêmes tirages initiaux**, éliminant le bruit Monte-Carlo lors du calcul des $\Delta\text{Score}$.
- **State Forking (Clonage en 4 branches)** : Sur un sous-échantillon de parties aux tours clés ($T \in \{2, 4, 6\}$), juste après l'Étape 1, l'état `GameState` (incluant `rngState`) est cloné en 4 exemplaires :
  - *Clone 0 (Référence)* : Décision normale du Bot Coopératif.
  - *Clone 1 (Construction Forcée)* : Force la formation d'un binôme sur une Tuile de Synergie disponible en lisière ce tour-ci, puis reprend le jeu normal jusqu'à la fin.
  - *Clone 2 (Furtivité Forcée)* : Force un binôme en Furtivité (Piège/Sabotage).
  - *Clone 3 (Défense Pure)* : Alloue tous les Défenseurs sur les pistes Forêt ce tour-ci.
  La différence $\Delta V = \text{Score}_{\text{Clone 1}} - \text{Score}_{\text{Clone 0}}$ mesure la valeur marginale réelle des tuiles disponibles sans biais de corrélation.

### 4.4. Les 5 Axes de Notation & l'Indice de Charge Cognitive ($ICC$)
1. **Axe 1 (Rythme & Fins)** : Répartition `% Tour 8 / % Gardiens / % Rêve`, tour moyen d'arrêt, et alerte *Snowball* si $> 10\%$ des parties s'arrêtent aux tours 1 à 4.
2. **Axe 2 (Équilibre Topologique)** : Écart-type inter-configurations $\sigma_{\text{topos}}$, biais par Peuple et détection des configurations *Outliers* ($|z| \ge 2\sigma$).
3. **Axe 3 (Richesse & Coopération)** : Entropie de Shannon $H$ des 6 actions mécaniques, $\Delta_{\text{Coop}} = \text{Score}_{\text{Coopératif}} - \text{Score}_{\text{Réflexe}}$, $\Delta_{\text{Réflexion 2.2}}$ et *Pick Rate* des 30 tuiles.
4. **Axe 4 (Calibration du Score)** : Moyenne, médiane, P10, P90 du ratio d'arbres sauvés après Repousse, taux de parcelles rasées et courbe d'érosion tour par tour ($T1 \rightarrow T8$).
5. **Axe 5 (Charge Cognitive $ICC$)** : Combinaison pondérée de 4 compteurs objectifs :
   - $ICC_{\text{statique}}$ : Nombre moyen de briques élémentaires par Slot + pénalités pour conditions et cycles multi-faces.
   - $ICC_{\text{cascade}}$ : Nombre moyen de réactions en chaîne sur la Piste des Gardiens et de manipulations de piste par tour.
   - $ICC_{\text{calcul}}$ : Nombre moyen de modificateurs simultanés appliqués au Seuil de Parade à l'Étape 5.
   - $ICC_{\text{opacité}} = \max(0,\; \text{Score}_{\text{Oracle}} - \text{Score}_{\text{Coopératif}})$ : Mesure le coût de l'information cachée.
