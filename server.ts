import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

import type {
  CampaignConfig,
  CampaignResult,
  PatchSheet,
  SlotLibraryItem,
} from './src/sim/types.ts';
import {
  BASELINE_PATCH_V4_6,
  CUSTOM_SWEEP_PATCH_01,
  DEFAULT_SLOT_LIBRARY,
} from './src/sim/defaultPatches.ts';
import { parsePatchOrSlotText } from './src/sim/patchCompiler.ts';
import { generateTopologies } from './src/sim/topology.ts';
import { runCampaign } from './src/sim/campaignRunner.ts';
import { buildGcpWorkerBundle } from './src/sim/gcpExporter.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

interface PersistedStore {
  slotLibrary: SlotLibraryItem[];
  patches: PatchSheet[];
  campaigns: CampaignResult[];
}

function loadStore(): PersistedStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedStore;
      return {
        slotLibrary: parsed.slotLibrary?.length ? parsed.slotLibrary : DEFAULT_SLOT_LIBRARY,
        patches: parsed.patches?.length
          ? parsed.patches
          : [BASELINE_PATCH_V4_6, CUSTOM_SWEEP_PATCH_01],
        campaigns: parsed.campaigns ?? [],
      };
    }
  } catch (err) {
    console.warn('Chargement du store local impossible, réinitialisation:', err);
  }
  return {
    slotLibrary: [...DEFAULT_SLOT_LIBRARY],
    patches: [BASELINE_PATCH_V4_6, CUSTOM_SWEEP_PATCH_01],
    campaigns: [],
  };
}

function saveStore(store: PersistedStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Sauvegarde du store impossible:', err);
  }
}

/**
 * IMPORTANT — RÈGLE DE MAINTENANCE DOCUMENTAIRE :
 * Toute modification de l'architecture, des règles du moteur, des paramètres ou de l'interface
 * DOIT être répercutée simultanément dans les 4 documents du dossier /docs :
 *   1. /docs/1_ARCHITECTURE_TECHNIQUE.md
 *   2. /docs/2_SPECIFICATION_FONCTIONNELLE.md
 *   3. /docs/3_GUIDE_DEPLOIEMENT.md
 *   4. /docs/4_GUIDE_CONFIGURATION_UTILISATION.md
 */
async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const store = loadStore();

  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      slotLibrary: store.slotLibrary,
      patches: store.patches,
      campaigns: store.campaigns,
    });
  });

  app.get('/api/docs', (_req, res) => {
    const docsDir = path.resolve(process.cwd(), 'docs');
    const files = [
      {
        id: 'arch',
        filename: '1_ARCHITECTURE_TECHNIQUE.md',
        title: '1. Architecture Technique',
      },
      {
        id: 'spec',
        filename: '2_SPECIFICATION_FONCTIONNELLE.md',
        title: '2. Spécification Fonctionnelle Générale',
      },
      {
        id: 'deploy',
        filename: '3_GUIDE_DEPLOIEMENT.md',
        title: '3. Guide de Déploiement',
      },
      {
        id: 'usage',
        filename: '4_GUIDE_CONFIGURATION_UTILISATION.md',
        title: '4. Guide de Configuration et d’Utilisation',
      },
    ].map((doc) => {
      const fullPath = path.join(docsDir, doc.filename);
      const content = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf-8')
        : '';
      return { ...doc, content };
    });
    res.json({ docs: files });
  });

  app.get('/api/topologies', (req, res) => {
    const oriented = req.query.oriented === 'true';
    const topologies = generateTopologies([3, 4, 5, 6], oriented);
    res.json({ count: topologies.length, oriented, topologies });
  });

  app.post('/api/slots', (req, res) => {
    try {
      const body = req.body as { rawText?: string; item?: SlotLibraryItem };
      let item: SlotLibraryItem;
      if (body.item) {
        item = body.item;
      } else if (body.rawText) {
        const parsed = parsePatchOrSlotText(body.rawText) as Record<string, unknown>;
        const slotObj = (parsed.slot ? parsed.slot : parsed) as SlotLibraryItem['slot'];
        if (!slotObj.id_slot || !Array.isArray(slotObj.effets)) {
          return res.status(400).json({ error: 'Le Slot doit contenir id_slot et effets[].' });
        }
        item = {
          id: `lib_${Date.now().toString(36)}`,
          label: String(parsed.label ?? `${slotObj.id_slot} — ${slotObj.nom ?? 'Slot personnalisé'}`),
          targetSlotId: slotObj.id_slot,
          tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : ['Personnalisé'],
          slot: slotObj,
          enabledForSweep: true,
          createdAt: new Date().toISOString(),
        };
      } else {
        return res.status(400).json({ error: 'Payload invalide.' });
      }

      const existingIdx = store.slotLibrary.findIndex((x) => x.id === item.id);
      if (existingIdx >= 0) store.slotLibrary[existingIdx] = item;
      else store.slotLibrary.unshift(item);

      saveStore(store);
      res.json({ slotLibrary: store.slotLibrary, item });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erreur de syntaxe JSON/YAML.',
      });
    }
  });

  app.delete('/api/slots/:id', (req, res) => {
    store.slotLibrary = store.slotLibrary.filter((x) => x.id !== req.params.id);
    saveStore(store);
    res.json({ slotLibrary: store.slotLibrary });
  });

  app.post('/api/patches', (req, res) => {
    try {
      const body = req.body as { rawText?: string; patch?: PatchSheet };
      let patch: PatchSheet;
      if (body.patch) {
        patch = body.patch;
      } else if (body.rawText) {
        const parsed = parsePatchOrSlotText(body.rawText) as Partial<PatchSheet>;
        if (!parsed.slots || typeof parsed.slots !== 'object') {
          return res.status(400).json({ error: 'La Feuille de Patch doit contenir un objet slots.' });
        }
        patch = {
          id: parsed.id || `patch_${Date.now().toString(36)}`,
          nom: parsed.nom || 'Patch Importé',
          version: parsed.version || '4.6.x',
          mode: parsed.mode === 'BASELINE' ? 'BASELINE' : 'CUSTOM',
          description: parsed.description || 'Feuille de Patch importée JSON/YAML.',
          slots: { ...BASELINE_PATCH_V4_6.slots, ...parsed.slots },
        };
      } else {
        return res.status(400).json({ error: 'Payload invalide.' });
      }

      const idx = store.patches.findIndex((p) => p.id === patch.id);
      if (idx >= 0) store.patches[idx] = patch;
      else store.patches.unshift(patch);

      saveStore(store);
      res.json({ patches: store.patches, patch });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Erreur de lecture JSON/YAML.',
      });
    }
  });

  app.post('/api/campaigns/run', (req, res) => {
    try {
      const config = req.body as CampaignConfig;
      const result = runCampaign(config, store.slotLibrary);
      store.campaigns = [result, ...store.campaigns].slice(0, 8);
      saveStore(store);
      res.json(result);
    } catch (err) {
      console.error('Erreur de simulation:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Échec lors de la simulation.',
      });
    }
  });

  app.post('/api/export/gcp', (req, res) => {
    const patch = (req.body as { patch?: PatchSheet }).patch ?? BASELINE_PATCH_V4_6;
    res.json({ files: buildGcpWorkerBundle(patch) });
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error:
            'Clé API Gemini manquante. Configurez GEMINI_API_KEY dans Settings > Secrets.',
        });
      }

      const { campaignId, activePatch } = req.body as {
        campaignId?: string;
        activePatch?: PatchSheet;
      };
      const campaign =
        store.campaigns.find((c) => c.campaignId === campaignId) ?? store.campaigns[0];

      if (!campaign) {
        return res.status(404).json({ error: 'Aucune campagne trouvée à analyser.' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Tu es l'Analyste Game Design expert du jeu coopératif asymétrique "Amazonia : Dernier Rempart (v4.6)".
Analyse le Dossier de Synthèse JSON issu de la campagne Monte-Carlo ci-dessous et propose un diagnostic rigoureux sur les 5 axes (Rythme/3 fins de partie, Équilibre topologique des 197 configurations, Richesse & Coopération muette Étape 2.2, Calibration des arbres sauvés, Charge cognitive ICC) ainsi que des ajustements concrets de Slots utilisant exclusivement les 7 Briques Élémentaires (MOD_SEUIL, CREATION_ENTITE, DEPLACEMENT, MOD_PUISSANCE, MOD_APPRENTISSAGE, PERMUTATION_PISTE, PARTAGE_INFO_ETAT_GARDIEN).

DOSSIER DE SYNTHÈSE :
${JSON.stringify(campaign.summaryForAI, null, 2)}

TUILES ACTUELLES MODIFIÉES DANS LE PATCH :
${JSON.stringify(
  Object.fromEntries(
    Object.entries((activePatch ?? BASELINE_PATCH_V4_6).slots).slice(0, 12),
  ),
  null,
  2,
)}

Réponds en français au format JSON strict selon le schéma demandé, en proposant 3 à 5 modifications ciblées de Slots dans suggestedSlots.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Tu es un chercheur senior en équilibre de jeux de société coopératifs asymétriques. Sois factuel, quantitatif et concis.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnostic_global: { type: Type.STRING },
              equilibre_fins_de_partie: { type: Type.STRING },
              evaluation_cooperation_et_opacite: { type: Type.STRING },
              diagnostic_tuiles_et_slots: { type: Type.STRING },
              recommandations_prioritaires: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              patch_nom: { type: Type.STRING },
              patch_description: { type: Type.STRING },
              suggestedSlots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id_slot: { type: Type.STRING },
                    nom: { type: Type.STRING },
                    description: { type: Type.STRING },
                    architecture_cycle_vie: { type: Type.STRING },
                    cible: { type: Type.STRING },
                    primitive: { type: Type.STRING },
                    valeur_X: { type: Type.INTEGER },
                  },
                },
              },
            },
          },
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson) as {
        diagnostic_global?: string;
        equilibre_fins_de_partie?: string;
        evaluation_cooperation_et_opacite?: string;
        diagnostic_tuiles_et_slots?: string;
        recommandations_prioritaires?: string[];
        patch_nom?: string;
        patch_description?: string;
        suggestedSlots?: {
          id_slot: string;
          nom?: string;
          description?: string;
          architecture_cycle_vie?: string;
          cible?: string;
          primitive?: string;
          valeur_X?: number;
        }[];
      };

      // Assemble valid corrective PatchSheet anchored on activePatch/baseline
      const baseSlots = { ...(activePatch ?? BASELINE_PATCH_V4_6).slots };
      for (const ss of parsed.suggestedSlots ?? []) {
        if (!ss.id_slot || !baseSlots[ss.id_slot]) continue;
        const prim = ss.primitive || 'MOD_SEUIL';
        const cible = ss.cible || 'PARCELLE_PLUS_MENACEE';
        baseSlots[ss.id_slot] = {
          ...baseSlots[ss.id_slot],
          id_slot: ss.id_slot,
          nom: ss.nom || baseSlots[ss.id_slot].nom,
          description: ss.description || baseSlots[ss.id_slot].description,
          effets: [
            {
              condition: 'AUCUNE',
              cible: cible as PatchSheet['slots'][string]['effets'][number]['cible'],
              primitive: prim as PatchSheet['slots'][string]['effets'][number]['primitive'],
              valeur_X: ss.valeur_X ?? 1,
            },
          ],
        };
      }

      const patchCorrectif: PatchSheet = {
        id: `patch_ai_${Date.now().toString(36)}`,
        nom: parsed.patch_nom || 'Patch Correctif IA',
        version: '4.6-ai',
        mode: 'CUSTOM',
        description:
          parsed.patch_description || 'Patch généré automatiquement suite au diagnostic Gemini.',
        slots: baseSlots,
      };

      res.json({
        diagnostic_global: parsed.diagnostic_global ?? '',
        equilibre_fins_de_partie: parsed.equilibre_fins_de_partie ?? '',
        evaluation_cooperation_et_opacite: parsed.evaluation_cooperation_et_opacite ?? '',
        diagnostic_tuiles_et_slots: parsed.diagnostic_tuiles_et_slots ?? '',
        recommandations_prioritaires: parsed.recommandations_prioritaires ?? [],
        patch_correctif: patchCorrectif,
      });
    } catch (err) {
      console.error('Erreur Analyste IA:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Erreur lors de la génération du diagnostic Gemini.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Simulateur Amazonia prêt sur http://localhost:${PORT}`);
  });
}

startServer();
