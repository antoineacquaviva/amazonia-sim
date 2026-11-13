import React from 'react';
import { Plus, Trash2, Upload, Check } from 'lucide-react';
import type {
  EffectCondition,
  LifecycleArchitecture,
  PatchSheet,
  PrimitiveType,
  SlotDefinition,
  SlotLibraryItem,
  TargetSelector,
} from '../sim/types.ts';
import { TILES_META } from '../sim/topology.ts';

interface Props {
  activePatch: PatchSheet;
  onUpdatePatch: (patch: PatchSheet) => void;
  slotLibrary: SlotLibraryItem[];
  onSaveLibrarySlot: (payload: { rawText?: string; item?: SlotLibraryItem }) => Promise<void>;
  onDeleteLibrarySlot: (id: string) => Promise<void>;
  onImportPatchText: (rawText: string) => Promise<void>;
}

const PRIMITIVES: PrimitiveType[] = [
  'MOD_SEUIL',
  'CREATION_ENTITE',
  'DEPLACEMENT',
  'MOD_PUISSANCE',
  'MOD_APPRENTISSAGE',
  'PERMUTATION_PISTE',
  'PARTAGE_INFO_ETAT_GARDIEN',
];

const TARGETS: TargetSelector[] = [
  'PARCELLE_PLUS_MENACEE',
  'PARCELLE_MACHINE_AVANCEE',
  'PARCELLE_DU_NID',
  'TOUTES_PARCELLES_CIBLEES',
  'LISIERE_VOISINE',
  'RANG_DU_DE_M',
  'RANG_REVE_ACTIF',
  'TACTIQUE_EN_TETE',
  'GARDIEN_CIBLE_OU_LIBRE',
  'MACHINE_PLUS_PUISSANTE',
];

const CONDITIONS: EffectCondition[] = [
  'AUCUNE',
  'SI_ARBRES_MENACES',
  'SI_DE_M_PAIR',
  'SI_DE_M_IMPAIR',
  'SI_REVE_EN_JEU',
  'SI_INSECTE_SUR_PISTE',
  'SI_SOUCHES_PRESENTES',
];

export const SlotLibraryView: React.FC<Props> = ({
  activePatch,
  onUpdatePatch,
  slotLibrary,
  onSaveLibrarySlot,
  onDeleteLibrarySlot,
  onImportPatchText,
}) => {
  const [familyFilter, setFamilyFilter] = React.useState<'ALL' | 'G' | 'R' | 'M' | 'INSECTE'>('ALL');
  const [selectedSlotId, setSelectedSlotId] = React.useState<string>('G1');
  const [rawImportText, setRawImportText] = React.useState<string>('');
  const [importMode, setImportMode] = React.useState<'SLOT' | 'PATCH'>('SLOT');
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const allSlotIds = React.useMemo(() => {
    const ids = TILES_META.filter((t) => {
      if (familyFilter === 'ALL') return true;
      return t.family === familyFilter;
    }).map((t) => t.code);
    if (familyFilter === 'ALL' || familyFilter === 'INSECTE') {
      ids.push('INSECTE_BUG', 'INSECTE_COLONIE');
    }
    return ids;
  }, [familyFilter]);

  const currentSlot: SlotDefinition = activePatch.slots[selectedSlotId] ?? {
    id_slot: selectedSlotId,
    nom: selectedSlotId,
    effets: [
      {
        condition: 'AUCUNE',
        cible: 'PARCELLE_PLUS_MENACEE',
        primitive: 'MOD_SEUIL',
        valeur_X: 1,
      },
    ],
  };

  const [slotJsonDraft, setSlotJsonDraft] = React.useState<string>(() =>
    JSON.stringify(currentSlot, null, 2),
  );

  React.useEffect(() => {
    setSlotJsonDraft(JSON.stringify(currentSlot, null, 2));
  }, [selectedSlotId, activePatch.id]);

  const firstEff = currentSlot.effets[0] ?? {
    condition: 'AUCUNE',
    cible: 'PARCELLE_PLUS_MENACEE',
    primitive: 'MOD_SEUIL',
    valeur_X: 1,
  };

  const updateCurrentSlotField = (updated: SlotDefinition) => {
    const nextPatch: PatchSheet = {
      ...activePatch,
      mode: 'CUSTOM',
      slots: {
        ...activePatch.slots,
        [selectedSlotId]: updated,
      },
    };
    onUpdatePatch(nextPatch);
    setSlotJsonDraft(JSON.stringify(updated, null, 2));
  };

  const handleApplyJsonDraft = () => {
    try {
      setErrorMsg(null);
      const parsed = JSON.parse(slotJsonDraft) as SlotDefinition;
      if (!parsed.id_slot || !Array.isArray(parsed.effets)) {
        throw new Error('Le JSON du Slot doit inclure id_slot et effets[].');
      }
      updateCurrentSlotField(parsed);
      setFeedback(`Slot ${parsed.id_slot} appliqué au patch actif.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'JSON invalide.');
    }
  };

  const handleAddCurrentToLibrary = async () => {
    try {
      setErrorMsg(null);
      const parsed = JSON.parse(slotJsonDraft) as SlotDefinition;
      const item: SlotLibraryItem = {
        id: `lib_${parsed.id_slot.toLowerCase()}_${Date.now().toString(36)}`,
        label: `${parsed.id_slot} — ${parsed.nom || 'Variante personnalisée'}`,
        targetSlotId: parsed.id_slot,
        tags: ['Éditeur', typeof parsed.effets[0]?.primitive === 'string' ? parsed.effets[0].primitive : 'Sweep'],
        slot: parsed,
        enabledForSweep: true,
        createdAt: new Date().toISOString(),
      };
      await onSaveLibrarySlot({ item });
      setFeedback(`Slot ajouté à la bibliothèque (${item.label}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur ajout bibliothèque.');
    }
  };

  const handleImportSubmit = async () => {
    if (!rawImportText.trim()) return;
    try {
      setErrorMsg(null);
      if (importMode === 'SLOT') {
        await onSaveLibrarySlot({ rawText: rawImportText });
        setFeedback('Slot JSON/YAML importé dans la bibliothèque.');
      } else {
        await onImportPatchText(rawImportText);
        setFeedback('Feuille de Patch JSON/YAML importée et sélectionnée.');
      }
      setRawImportText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Échec de l’import.');
    }
  };

  const hasSweep = JSON.stringify(currentSlot).includes('$Sweep');

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Contrat Déclaratif v4.6 · 7 Briques Élémentaires &amp; Balayage $Sweep
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Éditeur de Patch &amp; Bibliothèque de Slots
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { id: 'ALL', label: 'Tous (32)' },
              { id: 'G', label: 'Gardiens (15)' },
              { id: 'R', label: 'Rêves (10)' },
              { id: 'M', label: 'Croissance (5)' },
              { id: 'INSECTE', label: 'Insectes (2)' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFamilyFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                familyFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-medium underline"
          >
            Fermer
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-medium underline"
          >
            Fermer
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: 32 Slots List */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4">
          <div className="pb-2 text-xs font-medium text-slate-500">
            Slots du Patch : {activePatch.nom}
          </div>
          <div className="max-h-[540px] divide-y divide-slate-100 overflow-y-auto">
            {allSlotIds.map((id) => {
              const s = activePatch.slots[id];
              const isSelected = selectedSlotId === id;
              const isSweep = JSON.stringify(s ?? {}).includes('$Sweep');
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedSlotId(id)}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition-colors ${
                    isSelected ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{id}</span>
                      <span className="truncate text-slate-600">{s?.nom ?? 'Standard'}</span>
                    </div>
                    <div className="mt-0.5 truncate text-slate-400">
                      {typeof s?.effets?.[0]?.primitive === 'string'
                        ? s.effets[0].primitive
                        : 'Paramètre $Sweep'}
                      {s?.architecture_cycle_vie && typeof s.architecture_cycle_vie === 'string'
                        ? ` · ${s.architecture_cycle_vie}`
                        : ''}
                    </div>
                  </div>
                  {isSweep && (
                    <span className="font-mono text-[11px] font-semibold text-amber-700 shrink-0">
                      $Sweep
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Visual + JSON Slot Editor */}
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900">{selectedSlotId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{hasSweep ? 'Contient un paramètre $Sweep' : 'Paramètre fixe'}</span>
                </div>
                <h2 className="mt-0.5 text-base font-semibold text-slate-900">
                  {currentSlot.nom || selectedSlotId}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleAddCurrentToLibrary}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Enregistrer dans la Bibliothèque
              </button>
            </div>

            {/* Structured controls for quick edits */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {selectedSlotId.startsWith('G') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Cycle de vie (Gardiens)
                  </label>
                  <select
                    value={
                      typeof currentSlot.architecture_cycle_vie === 'string'
                        ? currentSlot.architecture_cycle_vie
                        : 'SIMPLE_CONTINU'
                    }
                    onChange={(e) =>
                      updateCurrentSlotField({
                        ...currentSlot,
                        architecture_cycle_vie: e.target.value as LifecycleArchitecture,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                  >
                    <option value="SIMPLE_CONTINU">SIMPLE_CONTINU</option>
                    <option value="DOUBLE_FACE_UPGRADE">DOUBLE_FACE_UPGRADE</option>
                    <option value="SACRIFICE_ONESHOT">SACRIFICE_ONESHOT</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Brique Élémentaire (Effet 1)
                </label>
                <select
                  value={
                    typeof firstEff.primitive === 'string'
                      ? firstEff.primitive
                      : 'MOD_SEUIL'
                  }
                  onChange={(e) => {
                    const nextEff = { ...firstEff, primitive: e.target.value as PrimitiveType };
                    updateCurrentSlotField({
                      ...currentSlot,
                      effets: [nextEff, ...currentSlot.effets.slice(1)],
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                >
                  {PRIMITIVES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Sélecteur de Cible
                </label>
                <select
                  value={
                    typeof firstEff.cible === 'string'
                      ? firstEff.cible
                      : 'PARCELLE_PLUS_MENACEE'
                  }
                  onChange={(e) => {
                    const nextEff = { ...firstEff, cible: e.target.value as TargetSelector };
                    updateCurrentSlotField({
                      ...currentSlot,
                      effets: [nextEff, ...currentSlot.effets.slice(1)],
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                >
                  {TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Condition d’exécution
                </label>
                <select
                  value={
                    typeof firstEff.condition === 'string' ? firstEff.condition : 'AUCUNE'
                  }
                  onChange={(e) => {
                    const nextEff = { ...firstEff, condition: e.target.value as EffectCondition };
                    updateCurrentSlotField({
                      ...currentSlot,
                      effets: [nextEff, ...currentSlot.effets.slice(1)],
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* JSON Editor with $Sweep support */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  Définition JSON du Slot (supporte {`{"$Sweep": [...]}`})
                </label>
                <button
                  type="button"
                  onClick={handleApplyJsonDraft}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <Check className="h-3.5 w-3.5" />
                  Appliquer au patch
                </button>
              </div>
              <textarea
                value={slotJsonDraft}
                onChange={(e) => setSlotJsonDraft(e.target.value)}
                rows={11}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Slot Library & Import JSON/YAML */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Bibliothèque de Slots ({slotLibrary.length})
              </h3>
              <p className="text-xs text-slate-500">
                Ajoute automatiquement ces variantes à la combinatoire des campagnes.
              </p>
              <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
                {slotLibrary.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-medium text-slate-900">{item.label}</div>
                      <div className="text-slate-500 font-mono">
                        Cible: {item.targetSlotId} · {item.tags.join(' / ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteLibrarySlot(item.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                      title="Supprimer ce Slot"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Importer JSON / YAML
                </h3>
                <div className="flex rounded-md bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setImportMode('SLOT')}
                    className={`rounded px-2 py-1 font-medium ${
                      importMode === 'SLOT' ? 'bg-white text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    Slot unitaire
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('PATCH')}
                    className={`rounded px-2 py-1 font-medium ${
                      importMode === 'PATCH' ? 'bg-white text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    Patch complet
                  </button>
                </div>
              </div>
              <textarea
                value={rawImportText}
                onChange={(e) => setRawImportText(e.target.value)}
                rows={7}
                placeholder={
                  importMode === 'SLOT'
                    ? 'Collez un bloc JSON ou YAML contenant id_slot et effets...'
                    : 'Collez une Feuille de Patch JSON ou YAML contenant nom et slots...'
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleImportSubmit}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800"
              >
                <Upload className="h-3.5 w-3.5" />
                Importer dans le simulateur
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
