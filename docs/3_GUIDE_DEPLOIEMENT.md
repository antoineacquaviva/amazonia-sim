# 3. Guide de Déploiement — Simulateur Amazonia (v4.6)

> **Statut du document** : Guide opérationnel vivant — maintenu automatiquement à chaque évolution de l'infrastructure ou des dépendances.  
> **Cible** : Utilisateur souhaitant exécuter l'application en local, la synchroniser avec GitHub (`antoineacquaviva/amazonia-sim`), la déployer en production (Cloud Run / Docker) ou lancer des jobs Python/Numba haute performance sur GCP.

---

## 1. Prérequis Techniques

- **Pour l'application Web Full-Stack (Locale / Serveur)** :
  - **Node.js** : version `20.x` ou `22.x` LTS recommandée.
  - **npm** : version `10+` (inclus avec Node.js).
  - **Clé API Google Gemini** (`GEMINI_API_KEY`) : requise uniquement pour l'onglet **Analyste IA** (les simulations Monte-Carlo, l'éditeur de patchs et les exports fonctionnent 100 % hors-ligne sans clé API).
- **Pour le Worker Python/Numba sur Google Cloud Platform (Optionnel — Calcul massif)** :
  - **Google Cloud SDK (`gcloud` CLI)** installé et authentifié.
  - Un projet GCP avec les API **Cloud Run**, **Cloud Build** et (optionnellement) **BigQuery / Vertex AI** activées.

---

## 2. Installation et Exécution en Local

### 2.1. Cloner et installer les dépendances
```bash
git clone https://github.com/antoineacquaviva/amazonia-sim.git
cd amazonia-sim
npm install
```

### 2.2. Configurer les variables d'environnement
Copiez le fichier d'exemple `.env.example` vers `.env` :
```bash
cp .env.example .env
```
Éditez le fichier `.env` et renseignez votre clé Gemini :
```env
GEMINI_API_KEY="votre_cle_api_gemini_ici"
APP_URL="http://localhost:3000"
```

### 2.3. Lancer en mode Développement
```bash
npm run dev
```
- L'application démarre sur **http://localhost:3000**.
- Les données que vous créez (Slots dans la bibliothèque, Feuilles de Patch importées, résultats de campagnes) sont automatiquement persistées sur disque dans le fichier `/data/store.json`.

### 2.4. Vérifier la compilation et le typage (Production Build)
```bash
npm run lint     # Vérifie le typage TypeScript (tsc --noEmit)
npm run build    # Compile le frontend React dans /dist
NODE_ENV=production npm start
```

---

## 3. Synchronisation avec votre Dépôt GitHub (`amazonia-sim`)

Si vous récupérez le code depuis Google AI Studio pour l'envoyer vers votre dépôt GitHub `https://github.com/antoineacquaviva/amazonia-sim` :

```bash
# Initialiser le dépôt local si ce n'est pas déjà fait
git init
git branch -M main

# Ajouter le dépôt distant GitHub
git remote add origin https://github.com/antoineacquaviva/amazonia-sim.git

# Vérifier que .env et node_modules sont bien ignorés (.gitignore)
git status

# Valider et pousser l'ensemble du code et de la documentation (/docs)
git add .
git commit -m "feat: implémentation complète du Simulateur Amazonia v4.6 et documentation"
git push -u origin main
```

---

## 4. Déploiement de l'Application Web sur Google Cloud Run

L'application Web Full-Stack (`server.ts` + interface React) peut être hébergée directement sur **Google Cloud Run** pour être accessible depuis n'importe quel navigateur.

### 4.1. Déploiement direct depuis les sources
Depuis la racine du projet :
```bash
gcloud run deploy amazonia-sim-web \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars NODE_ENV=production,GEMINI_API_KEY="VOTRE_CLE_GEMINI"
```

> **Note sur la persistance en conteneur serverless** : Sur Cloud Run, le système de fichiers local (`/data/store.json`) vit aussi longtemps que l'instance du conteneur est active. Pensez à utiliser les boutons **Télécharger la Feuille de Patch (.json)** et **Télécharger le Rapport (.md / .json)** dans l'onglet **Analyste IA** pour archiver vos campagnes importantes dans votre dépôt Git.

---

## 5. Déploiement du Worker HPC Python/Numba sur Cloud Run Jobs

Lorsque vous souhaitez exécuter des campagnes massives (ex. 100 variantes $\times$ 197 topologies $\times$ 500 parties = 10 à 50 millions de trajectoires) en quelques secondes sur 80 vCPU distribués :

1. Ouvrez l'application Web et rendez-vous dans l'onglet **Analyste IA**.
2. Dans l'encadré **Squelette Python / Numba GCP**, cliquez sur **Générer**.
3. Téléchargez les fichiers générés (`Dockerfile`, `deploy_cloud_run_job.sh`, `patches/active_patch.json`, `src/core/state.py`, `src/runner/worker.py`) dans un dossier dédié `gcp-worker/`.
4. Lancez le script de déploiement et d'exécution distribuée :

```bash
chmod +x deploy_cloud_run_job.sh
export GCP_PROJECT_ID="votre-id-projet-gcp"
export GCP_REGION="europe-west1"
./deploy_cloud_run_job.sh

# Exécuter immédiatement la campagne distribuée sur 20 tâches de 4 vCPU
gcloud run jobs execute amazonia-sim-campaign --region europe-west1
```

---

## 6. Dépannage Courant (Troubleshooting)

| Symptôme | Cause probable | Solution |
| :--- | :--- | :--- |
| Message `Clé API Gemini manquante` dans l'onglet Analyste IA | La variable `GEMINI_API_KEY` n'est pas définie côté serveur. | Dans AI Studio : ouvrez **Settings > Secrets** et ajoutez `GEMINI_API_KEY`. En local : ajoutez-la dans `.env` et relancez `npm run dev`. |
| Temps de simulation long (> 15 secondes) | Vous avez combiné **Orienté 394** + un grand nombre de `$Sweep` + $K > 50$. | Utilisez le mode **Stratifié (48)** avec $K=10$ pour le dégrossissage rapide (< 1 seconde), puis passez en **Exact 197** pour la validation finale des meilleures variantes. |
| Erreur lors de l'import d'un Slot ou d'un Patch | Syntaxe JSON/YAML mal formée ou absence des clés obligatoires `id_slot` et `effets`. | Vérifiez les accolades/indentations dans l'éditeur de l'onglet **Slots & Patchs** ; le message d'erreur rouge indique la clé manquante. |
