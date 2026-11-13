import React from 'react';
import { Play, Layers, SlidersHorizontal, GitBranch } from 'lucide-react';
import type {
  CampaignConfig,
  CampaignResult,
  ComportementBoutRayon,
  PatchSheet,
  RegleSeuilGardiens,
  SlotLibraryItem,
} from '../sim/types.ts';
import { buildVariantsForCampaign } from '../sim/patchCompiler.ts';

interface Props {
  config: CampaignConfig;
  setConfig: React.Dispatch<React.SetStateAction<CampaignConfig>>;
  patches: PatchSheet[];
  slotLibrary: SlotLibraryItem[];
  campaigns: CampaignResult[];
  activeCampaignId: string | null;
  onSelectCampaign: (id: string) => void;
  onRunCampaign: () => void;
  isRunning: boolean;
}

const BOUT_OPTIONS: { value: ComportementBoutRayon; label: string; desc: string }[] = [
  {
    value: 'FRAPPE_SUR_PLACE',
    label: 'Frappe sur place',
    desc: 'T2/T5 frappent Pmax ; T3/T6 frappent deux fois Pmax.',
  },
  {
    value: 'FRAPPE_A_VIDE_AVANT',
    label: 'Frappe à vide devant',
    desc: 'La frappe en Pmax+1 est perdue, seule Pmax s’applique.',
  },
  {
    value: 'DEGAT_COEUR',
    label: 'Dégât cœur adjacent',
    desc: 'Une frappe au-delà de Pmax retire 1 arbre sur un rayon adjacent.',
  },
  {
    value: 'BOUCLE_VOISIN',
    label: 'Boucle voisin',
    desc: 'Cible la parcelle Pmax du rayon voisin suivant.',
  },
];

const SEUIL_OPTIONS: { value: RegleSeuilGardiens; label: string; desc: string }[] = [
  {
    value: 'FIXE_N',
    label: 'Fixe (N tuiles)',
    desc: 'Exactement N tuiles Gardien posées sur la piste.',
  },
  {
    value: 'ADAPTATIF_DISPO',
    label: 'Adaptatif dispo',
    desc: 'min(N, nb tuiles G disponibles) avec plancher à 2.',
  },
  {
    value: 'COMPTEUR_RESONANCE',
    label: 'Compteur Résonance',
    desc: 'Seuil adaptatif OU K activations du Déclencheur 4.',
  },
];

export const ChassisCampaignView: React.FC<Props> = ({
  config,
  setConfig,
  patches,
  slotLibrary,
  campaigns,
  activeCampaignId,
  onSelectCampaign,
  onRunCampaign,
  isRunning,
}) => {
  const selectedLib = config.includeLibrarySlots
    ? slotLibrary.filter((x) => config.librarySlotIds.includes(x.id))
    : [];

  const previewVariants = React.useMemo(
    () =>
      buildVariantsForCampaign(config.chassisSweep, config.patchSheet, selectedLib, 24),
    [config.chassisSweep, config.patchSheet, selectedLib],
  );

  const topoCount =
    config.topologyMode === 'SAMPLE_STRATIFIED'
      ? config.sampleCount
      : config.topologyMode === 'ORIENTED_394'
        ? 394
        : 197;

  const estimatedGames =
    previewVariants.length * topoCount * config.monteCarloRuns * 3;

  const toggleN = (n: 3 | 4 | 5 | 6) => {
    setConfig((prev) => {
      const cur = prev.chassisSweep.N_Joueurs;
      const next = cur.includes(n)
        ? cur.length > 1
          ? cur.filter((x) => x !== n)
          : cur
        : ([...cur, n].sort() as (3 | 4 | 5 | 6)[]);
      return { ...prev, chassisSweep: { ...prev.chassisSweep, N_Joueurs: next } };
    });
  };

  const togglePMax = (p: number) => {
    setConfig((prev) => {
      const cur = prev.chassisSweep.P_Max;
      const next = cur.includes(p)
        ? cur.length > 1
          ? cur.filter((x) => x !== p)
          : cur
        : [...cur, p].sort();
      return { ...prev, chassisSweep: { ...prev.chassisSweep, P_Max: next } };
    });
  };

  const toggleBout = (b: ComportementBoutRayon) => {
    setConfig((prev) => {
      const cur = prev.chassisSweep.Comportement_Bout_Rayon;
      const next = cur.includes(b)
        ? cur.length > 1
          ? cur.filter((x) => x !== b)
          : cur
        : [...cur, b];
      return {
        ...prev,
        chassisSweep: { ...prev.chassisSweep, Comportement_Bout_Rayon: next },
      };
    });
  };

  const toggleSeuil = (s: RegleSeuilGardiens) => {
    setConfig((prev) => {
      const cur = prev.chassisSweep.Regle_Seuil_Gardiens;
      const next = cur.includes(s)
        ? cur.length > 1
          ? cur.filter((x) => x !== s)
          : cur
        : [...cur, s];
      return {
        ...prev,
        chassisSweep: { ...prev.chassisSweep, Regle_Seuil_Gardiens: next },
      };
    });
  };

  const toggleRevisionMode = (val: boolean) => {
    setConfig((prev) => {
      const cur = prev.chassisSweep.Revision_Etape_2_2;
      const next = cur.includes(val)
        ? cur.length > 1
          ? cur.filter((x) => x !== val)
          : cur
        : [...cur, val];
      return {
        ...prev,
        chassisSweep: { ...prev.chassisSweep, Revision_Etape_2_2: next },
      };
    });
  };

  const toggleLibSlot = (id: string) => {
    setConfig((prev) => {
      const cur = prev.librarySlotIds;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, librarySlotIds: next };
    });
  };

  return (
    <div className="space-y-8">
      {/* Header summary strip */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Moteur du Châssis Invariable v4.6 · Exploration en grille &amp; Common Random Numbers
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Configuration du Châssis &amp; Lancement de Campagne
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-500">Plan d’expérience calculé</div>
            <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {previewVariants.length} variante{previewVariants.length > 1 ? 's' : ''} × {topoCount} topos × {config.monteCarloRuns} × 3 bots ={' '}
              <span className="text-emerald-700">
                {estimatedGames.toLocaleString('fr-FR')} parties
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRunCampaign}
            disabled={isRunning}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4" />
            {isRunning ? 'Simulation en cours...' : 'Lancer la campagne'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 cols: Chassis Grid Search */}
        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">
                Vecteur de Configuration du Châssis (Grid Search)
              </h2>
            </div>
            <span className="text-xs text-slate-500">Multi-sélection pour balayer</span>
          </div>

          {/* Campaign Name + N_Joueurs + P_Max */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Nom de la campagne
              </label>
              <input
                type="text"
                value={config.nom}
                onChange={(e) => setConfig((p) => ({ ...p, nom: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                N_Joueurs autour de la Roue
              </label>
              <div className="mt-2 flex gap-1.5">
                {([3, 4, 5, 6] as const).map((n) => {
                  const active = config.chassisSweep.N_Joueurs.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleN(n)}
                      className={`flex-1 rounded-md border py-2 font-mono text-xs font-medium transition-colors tabular-nums ${
                        active
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {n}J
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                P_Max (Parcelles par piste Forêt)
              </label>
              <div className="mt-2 flex gap-1.5">
                {[3, 4, 5].map((p) => {
                  const active = config.chassisSweep.P_Max.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePMax(p)}
                      className={`flex-1 rounded-md border py-2 font-mono text-xs font-medium transition-colors tabular-nums ${
                        active
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      P={p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Comportement_Bout_Rayon */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Comportement_Bout_Rayon (Machine en P_max jouant T2, T3, T5, T6)
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BOUT_OPTIONS.map((opt) => {
                const active = config.chassisSweep.Comportement_Bout_Rayon.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleBout(opt.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-emerald-700 bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Regle_Seuil_Gardiens */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Regle_Seuil_Gardiens (Arrêt anticipé « Réveil de la Forêt »)
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SEUIL_OPTIONS.map((opt) => {
                const active = config.chassisSweep.Regle_Seuil_Gardiens.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleSeuil(opt.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-emerald-700 bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Revision Etape 2.2 & Courbe de Croissance */}
          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Boucle de révision muette (Étape 2.2)
              </label>
              <div className="mt-2 flex gap-2">
                {[
                  { val: true, label: 'Activée (En réflexion → Définitif)' },
                  { val: false, label: 'Désactivée (Verrou direct)' },
                ].map((opt) => {
                  const active = config.chassisSweep.Revision_Etape_2_2.includes(opt.val);
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => toggleRevisionMode(opt.val)}
                      className={`flex-1 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Courbe de Croissance du Nid (Étape 4.2)
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 tabular-nums">
                {config.chassisSweep.Courbe_Croissance_Nid[0].map((th, i) => (
                  <span key={i}>
                    {th.minInsects}–{th.maxInsects > 50 ? '∞' : th.maxInsects} ins → +{th.spawn}
                    {i < config.chassisSweep.Courbe_Croissance_Nid[0].length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Right 5 cols: Patch Sheet + Slot Library + Monte Carlo Matrix */}
        <section className="space-y-6 lg:col-span-5">
          {/* Patch & Library Injection */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers className="h-4 w-4 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">
                Feuille de Patch &amp; Bibliothèque de Slots
              </h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Feuille de Patch active
              </label>
              <select
                value={config.patchSheet.id}
                onChange={(e) => {
                  const found = patches.find((p) => p.id === e.target.value);
                  if (found) setConfig((prev) => ({ ...prev, patchSheet: found }));
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              >
                {patches.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} (v{p.version})
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">{config.patchSheet.description}</p>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  Combinatoire Bibliothèque de Slots (§3.4)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((p) => ({
                      ...p,
                      includeLibrarySlots: !p.includeLibrarySlots,
                    }))
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    config.includeLibrarySlots
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {config.includeLibrarySlots ? 'Activée' : 'Désactivée'}
                </button>
              </div>

              {config.includeLibrarySlots && (
                <div className="mt-2.5 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {slotLibrary.map((item) => {
                    const checked = config.librarySlotIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLibSlot(item.id)}
                            className="h-3.5 w-3.5 accent-emerald-700"
                          />
                          <span className="font-medium text-slate-800">{item.label}</span>
                        </div>
                        <span className="font-mono text-slate-500">{item.targetSlotId}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Exploration Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <GitBranch className="h-4 w-4 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">
                Matrice d’Exécution &amp; State Forking
              </h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Couverture topologique (3 à 6 joueurs)
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { id: 'SAMPLE_STRATIFIED', label: 'Stratifié (48)' },
                    { id: 'ALL_197', label: 'Exact 197' },
                    { id: 'ORIENTED_394', label: 'Orienté 394' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setConfig((p) => ({ ...p, topologyMode: m.id }))}
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      config.topologyMode === m.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Parties K / config / bot
                </label>
                <input
                  type="number"
                  min={2}
                  max={250}
                  value={config.monteCarloRuns}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      monteCarloRuns: Math.max(2, Math.min(250, Number(e.target.value) || 10)),
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-emerald-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Graine CRN (Aléatoire contrôlé)
                </label>
                <input
                  type="number"
                  value={config.seed}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, seed: Number(e.target.value) || 42 }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:border-emerald-700 focus:outline-none"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-xs">
              <div>
                <div className="font-medium text-slate-800">
                  Activer le State Forking (Clonage 4 branches)
                </div>
                <div className="text-slate-500">
                  Calcule le ΔV marginal de chaque tuile sans bruit aléatoire.
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.includeForking}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, includeForking: e.target.checked }))
                }
                className="h-4 w-4 accent-emerald-700"
              />
            </label>
          </div>
        </section>
      </div>

      {/* Preview of expanded variants & Historical Campaigns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between pb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Aperçu des Variantes Compilées ({previewVariants.length})
            </h3>
            <span className="text-xs text-slate-500">
              V0 = Socle Référence v4.6 toujours inclus
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto border-t border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">ID</th>
                  <th className="py-2 pr-3 font-medium">Description de variante</th>
                  <th className="py-2 text-right font-medium">ICC Statique</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewVariants.map((v) => (
                  <tr key={v.variantId} className="hover:bg-slate-50/80">
                    <td className="py-2 pr-3 font-mono font-medium text-slate-700 tabular-nums">
                      {v.variantId}
                    </td>
                    <td className="py-2 pr-3 text-slate-800">{v.label}</td>
                    <td className="py-2 text-right font-mono text-slate-600 tabular-nums">
                      {v.iccStatique.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <h3 className="pb-3 text-sm font-semibold text-slate-900">
            Campagnes Récentes ({campaigns.length})
          </h3>
          {campaigns.length === 0 ? (
            <div className="border-t border-slate-100 pt-6 text-center text-xs text-slate-500">
              Aucune campagne enregistrée pour le moment. Lancez votre première simulation pour
              générer les métriques sur les 5 axes.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
              {campaigns.map((c) => (
                <button
                  key={c.campaignId}
                  type="button"
                  onClick={() => onSelectCampaign(c.campaignId)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    activeCampaignId === c.campaignId
                      ? 'border-emerald-700 bg-emerald-50/70'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-slate-900">{c.nom}</div>
                    <div className="mt-0.5 text-slate-500 tabular-nums">
                      {c.totalGamesSimulated.toLocaleString('fr-FR')} parties · {c.variants.length} variantes · {c.durationMs} ms
                    </div>
                  </div>
                  <span className="font-mono font-medium text-emerald-700">Voir →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
