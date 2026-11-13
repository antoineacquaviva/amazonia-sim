import React from 'react';
import { Download, Sparkles, CheckCircle2, FileCode2 } from 'lucide-react';
import type { AiAnalysisResponse, CampaignResult, PatchSheet } from '../sim/types.ts';
import { buildMarkdownReport } from '../sim/campaignRunner.ts';

interface Props {
  campaign: CampaignResult | null;
  activePatch: PatchSheet;
  onApplyAiPatch: (patch: PatchSheet) => Promise<void>;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const AiAnalystExportView: React.FC<Props> = ({
  campaign,
  activePatch,
  onApplyAiPatch,
}) => {
  const [analyzing, setAnalyzing] = React.useState(false);
  const [aiResult, setAiResult] = React.useState<AiAnalysisResponse | null>(null);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [patchApplied, setPatchApplied] = React.useState(false);
  const [gcpFiles, setGcpFiles] = React.useState<Record<string, string> | null>(null);

  const handleAnalyze = async () => {
    if (!campaign) return;
    setAnalyzing(true);
    setAiError(null);
    setPatchApplied(false);
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.campaignId,
          activePatch,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Échec de l’analyse Gemini.');
      }
      setAiResult(data as AiAnalysisResponse);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLoadGcpBundle = async () => {
    const resp = await fetch('/api/export/gcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: activePatch }),
    });
    const data = await resp.json();
    setGcpFiles(data.files ?? null);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Smart Summarization (&lt; 30k tokens) · Analyste IA Gemini &amp; Export GitHub / GCP
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Analyste Game Design &amp; Exports
          </h1>
        </div>
        {campaign && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            {analyzing ? 'Analyse Gemini en cours...' : 'Lancer le Diagnostic IA'}
          </button>
        )}
      </div>

      {!campaign ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Exécutez d’abord une campagne pour générer le Dossier de Synthèse et activer l’Analyste IA.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 cols: Gemini Analysis Output */}
          <div className="space-y-6 lg:col-span-7">
            {aiError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                {aiError}
              </div>
            )}

            {aiResult ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    Rapport de Game Design — Gemini
                  </h2>
                  <button
                    type="button"
                    onClick={async () => {
                      await onApplyAiPatch(aiResult.patch_correctif);
                      setPatchApplied(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    {patchApplied ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        Patch appliqué ({aiResult.patch_correctif.nom})
                      </>
                    ) : (
                      'Injecter et tester ce Patch Correctif'
                    )}
                  </button>
                </div>

                <div className="space-y-4 text-xs leading-relaxed text-slate-700">
                  <div>
                    <h3 className="font-semibold text-slate-900">Diagnostic global</h3>
                    <p className="mt-1">{aiResult.diagnostic_global}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Équilibre des 3 voies de fin de partie
                    </h3>
                    <p className="mt-1">{aiResult.equilibre_fins_de_partie}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Coopération muette (Étape 2.2) &amp; Opacité
                    </h3>
                    <p className="mt-1">{aiResult.evaluation_cooperation_et_opacite}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Santé des 30 Tuiles &amp; Slots d’Insectes
                    </h3>
                    <p className="mt-1">{aiResult.diagnostic_tuiles_et_slots}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Recommandations prioritaires
                    </h3>
                    <ul className="mt-1.5 space-y-1">
                      {aiResult.recommandations_prioritaires.map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-base font-semibold text-slate-900">
                  Dossier de Synthèse Condense (Prêt pour Gemini)
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Structure JSON normalisée (§3 Smart Summarization) envoyée au modèle sans saturer
                  la fenêtre de contexte.
                </p>
                <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] text-slate-800">
                  {JSON.stringify(campaign.summaryForAI, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Right 5 cols: Exports & Python/Numba GCP Generator */}
          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                Exports de Campagne &amp; Patch
              </h2>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${campaign.campaignId}_rapport.md`,
                    buildMarkdownReport(campaign),
                    'text/markdown',
                  )
                }
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span>Télécharger le Rapport Markdown (.md)</span>
                <Download className="h-4 w-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${campaign.campaignId}_synthese.json`,
                    JSON.stringify(campaign.summaryForAI, null, 2),
                    'application/json',
                  )
                }
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span>Télécharger le Dossier JSON IA (.json)</span>
                <Download className="h-4 w-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${activePatch.id}.json`,
                    JSON.stringify(activePatch, null, 2),
                    'application/json',
                  )
                }
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span>Télécharger la Feuille de Patch active (.json)</span>
                <Download className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Squelette Python / Numba GCP
                </h2>
                <button
                  type="button"
                  onClick={handleLoadGcpBundle}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  Générer
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Génère les fichiers Cloud Run Jobs (`Dockerfile`, `state.py`, `worker.py`,
                `deploy_cloud_run_job.sh`) prêts pour votre dépôt GitHub `amazonia-sim`.
              </p>

              {gcpFiles && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  {Object.entries(gcpFiles).map(([fname, content]) => (
                    <button
                      key={fname}
                      type="button"
                      onClick={() => downloadFile(fname.split('/').pop() || fname, content, 'text/plain')}
                      className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 hover:bg-slate-100"
                    >
                      <span>{fname}</span>
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Living Git Documentation Viewer & Downloader */}
      <GitDocsSection />
    </div>
  );
};

interface DocEntry {
  id: string;
  filename: string;
  title: string;
  content: string;
}

const GitDocsSection: React.FC = () => {
  const [docs, setDocs] = React.useState<DocEntry[]>([]);
  const [activeDocId, setActiveDocId] = React.useState<string>('arch');

  React.useEffect(() => {
    fetch('/api/docs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.docs) && data.docs.length > 0) {
          setDocs(data.docs);
          setActiveDocId(data.docs[0].id);
        }
      })
      .catch(() => {});
  }, []);

  if (docs.length === 0) return null;
  const current = docs.find((d) => d.id === activeDocId) ?? docs[0];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Documentation Officielle du Dépôt Git (/docs)
          </h2>
          <p className="text-xs text-slate-500">
            Ces 4 documents sont versionnés dans /docs et maintenus automatiquement à chaque évolution.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadFile(current.filename, current.content, 'text/markdown;charset=utf-8')
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap self-start sm:self-auto"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          Télécharger {current.filename}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1 text-xs">
        {docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setActiveDocId(doc.id)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              doc.id === current.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {doc.title}
          </button>
        ))}
      </div>

      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-5 font-mono text-xs leading-relaxed text-slate-800">
        {current.content}
      </pre>
    </section>
  );
};

