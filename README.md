# Simulateur Amazonia — Dernier Rempart (v4.6)

Simulateur Monte-Carlo haute vélocité et atelier d'équilibrage de game design pour le jeu de société coopératif asymétrique **Amazonia : Dernier Rempart (v4.6)**.

---

## Documentation du Projet (`/docs`)

> **Règle de maintenance du dépôt** : Les quatre documents ci-dessous constituent la documentation de référence du projet. Toute évolution future du moteur, des règles, de la grammaire de patch ou de l'interface **doit systématiquement mettre à jour ces 4 documents** de manière synchrone.

1. **[1. Architecture Technique](./docs/1_ARCHITECTURE_TECHNIQUE.md)**  
   *Découplage en 3 couches, structure des fichiers, modèle mémoire contigu « Flat-Array » (`TypedArray` + PRNG `Xoshiro128++`), compilateur de bytecode des Slots, file binaire de cascades à 6 bits et API serveur Express.*
2. **[2. Spécification Fonctionnelle Générale](./docs/2_SPECIFICATION_FONCTIONNELLE.md)**  
   *Conformité détaillée aux règles v4.6 (matrice $6 \times 6$ des 30 tuiles, 6 étapes du tour, 3 fins de partie, Repousse), workflow d'une simulation, énumération exacte des 197/394 topologies, modélisation des 3 profils de bots (Réflexe, Coopératif à révision muette 2.2, Oracle), State Forking et formules des 5 axes / $ICC$.*
3. **[3. Guide de Déploiement](./docs/3_GUIDE_DEPLOIEMENT.md)**  
   *Installation locale (`npm run dev`), configuration `.env`, synchronisation GitHub (`antoineacquaviva/amazonia-sim`), déploiement Web sur Google Cloud Run et exécution distribuée du worker Python/Numba sur Cloud Run Jobs.*
4. **[4. Guide de Configuration et d'Utilisation](./docs/4_GUIDE_CONFIGURATION_UTILISATION.md)**  
   *Prise en main pas-à-pas des 5 onglets, paramétrage du Châssis en grille, grammaire déclarative JSON/YAML des 32 Slots (7 Briques Élémentaires + opérateur `$Sweep` + Bibliothèque de Slots), lecture des métriques et utilisation de l'Analyste IA Gemini.*

---

## Démarrage Rapide

```bash
npm install
cp .env.example .env   # Renseignez GEMINI_API_KEY pour l'onglet Analyste IA
npm run dev            # Ouvre http://localhost:3000
```
