import React from 'react';
import { Play } from 'lucide-react';
import type {
  CampaignConfig,
  CampaignResult,
  PatchSheet,
  SlotLibraryItem,
} from './sim/types.ts';
import {
  BASELINE_PATCH_V4_6,
  CUSTOM_SWEEP_PATCH_01,
  DEFAULT_CHASSIS_SWEEP,
  DEFAULT_SLOT_LIBRARY,
} from './sim/defaultPatches.ts';
import { ChassisCampaignView } from './components/ChassisCampaignView.tsx';
import { SlotLibraryView } from './components/SlotLibraryView.tsx';
import { ResultsAxesView } from './components/ResultsAxesView.tsx';
import { TopologyExplorerView } from './components/TopologyExplorerView.tsx';
import { AiAnalystExportView } from './components/AiAnalystExportView.tsx';

type ActiveTab = 'CAMPAIGN' | 'SLOTS' | 'RESULTS' | 'TOPOLOGIES' | 'ANALYST';

export default function App() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('CAMPAIGN');
  const [patches, setPatches] = React.useState<PatchSheet[]>([
    CUSTOM_SWEEP_PATCH_01,
    BASELINE_PATCH_V4_6,
  ]);
  const [slotLibrary, setSlotLibrary] = React.useState<SlotLibraryItem[]>(DEFAULT_SLOT_LIBRARY);
  const [campaigns, setCampaigns] = React.useState<CampaignResult[]>([]);
  const [activeCampaignId, setActiveCampaignId] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const [config, setConfig] = React.useState<CampaignConfig>({
    nom: 'Campagne Calibrage v4.6 — Socle vs Patch Thématique',
    chassisSweep: DEFAULT_CHASSIS_SWEEP,
    patchSheet: CUSTOM_SWEEP_PATCH_01,
    includeLibrarySlots: false,
    librarySlotIds: [],
    topologyMode: 'SAMPLE_STRATIFIED',
    sampleCount: 48,
    monteCarloRuns: 10,
    includeForking: true,
    seed: 20260406,
  });

  React.useEffect(() => {
    fetch('/api/bootstrap')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.patches) && data.patches.length > 0) {
          setPatches(data.patches);
          const preferred =
            data.patches.find((p: PatchSheet) => p.id === 'custom_sweep_01') ?? data.patches[0];
          setConfig((prev) => ({ ...prev, patchSheet: preferred }));
        }
        if (Array.isArray(data.slotLibrary)) {
          setSlotLibrary(data.slotLibrary);
        }
        if (Array.isArray(data.campaigns) && data.campaigns.length > 0) {
          setCampaigns(data.campaigns);
          setActiveCampaignId(data.campaigns[0].campaignId);
        }
      })
      .catch(() => {
        // Fallback already initialized cleanly in state
      });
  }, []);

  const handleRunCampaign = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/campaigns/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Échec lors de l’exécution de la campagne.');
      }
      const res = data as CampaignResult;
      setCampaigns((prev) => [res, ...prev.filter((c) => c.campaignId !== res.campaignId)]);
      setActiveCampaignId(res.campaignId);
      setActiveTab('RESULTS');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de simulation.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSavePatch = async (patch: PatchSheet) => {
    setConfig((prev) => ({ ...prev, patchSheet: patch }));
    setPatches((prev) => {
      const idx = prev.findIndex((p) => p.id === patch.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = patch;
        return next;
      }
      return [patch, ...prev];
    });
    await fetch('/api/patches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
  };

  const handleImportPatchText = async (rawText: string) => {
    const resp = await fetch('/api/patches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erreur import patch.');
    if (data.patches) setPatches(data.patches);
    if (data.patch) setConfig((prev) => ({ ...prev, patchSheet: data.patch }));
  };

  const handleSaveLibrarySlot = async (payload: {
    rawText?: string;
    item?: SlotLibraryItem;
  }) => {
    const resp = await fetch('/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erreur sauvegarde Slot.');
    if (data.slotLibrary) setSlotLibrary(data.slotLibrary);
  };

  const handleDeleteLibrarySlot = async (id: string) => {
    const resp = await fetch(`/api/slots/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.slotLibrary) setSlotLibrary(data.slotLibrary);
    setConfig((prev) => ({
      ...prev,
      librarySlotIds: prev.librarySlotIds.filter((x) => x !== id),
    }));
  };

  const handleApplyAiPatch = async (patch: PatchSheet) => {
    await handleSavePatch(patch);
    setConfig((prev) => ({
      ...prev,
      nom: `Test Correctif IA — ${patch.nom}`,
      patchSheet: patch,
    }));
    setActiveTab('CAMPAIGN');
  };

  const activeCampaign =
    campaigns.find((c) => c.campaignId === activeCampaignId) ?? campaigns[0] ?? null;

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'CAMPAIGN', label: 'Campagne' },
    { id: 'SLOTS', label: 'Slots & Patchs' },
    { id: 'RESULTS', label: 'Résultats 5 Axes' },
    { id: 'TOPOLOGIES', label: 'Topologies' },
    { id: 'ANALYST', label: 'Analyste IA' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single-line brand wordmark */}
          <span className="font-display text-lg font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Simulateur Amazonia
          </span>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-emerald-700 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleRunCampaign}
              disabled={isRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? 'Simulation...' : 'Lancer une campagne'}
            </button>
          </div>
        </div>

        {/* Mobile Nav Fallback */}
        <div className="flex overflow-x-auto border-t border-slate-100 px-4 md:hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`border-b-2 px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'border-emerald-700 text-slate-900'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-6 py-8">
        {errorMsg && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
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

        {activeTab === 'CAMPAIGN' && (
          <ChassisCampaignView
            config={config}
            setConfig={setConfig}
            patches={patches}
            slotLibrary={slotLibrary}
            campaigns={campaigns}
            activeCampaignId={activeCampaignId}
            onSelectCampaign={(id) => {
              setActiveCampaignId(id);
              setActiveTab('RESULTS');
            }}
            onRunCampaign={handleRunCampaign}
            isRunning={isRunning}
          />
        )}

        {activeTab === 'SLOTS' && (
          <SlotLibraryView
            activePatch={config.patchSheet}
            onUpdatePatch={handleSavePatch}
            slotLibrary={slotLibrary}
            onSaveLibrarySlot={handleSaveLibrarySlot}
            onDeleteLibrarySlot={handleDeleteLibrarySlot}
            onImportPatchText={handleImportPatchText}
          />
        )}

        {activeTab === 'RESULTS' && (
          <ResultsAxesView
            campaign={activeCampaign}
            onRunDefault={handleRunCampaign}
            onGoToAnalyst={() => setActiveTab('ANALYST')}
            isRunning={isRunning}
          />
        )}

        {activeTab === 'TOPOLOGIES' && <TopologyExplorerView />}

        {activeTab === 'ANALYST' && (
          <AiAnalystExportView
            campaign={activeCampaign}
            activePatch={config.patchSheet}
            onApplyAiPatch={handleApplyAiPatch}
          />
        )}
      </main>
    </div>
  );
}
