import React from 'react';
import { AlertTriangle, Play, Sparkles } from 'lucide-react';
import type { CampaignResult, VariantResult } from '../sim/types.ts';

interface Props {
  campaign: CampaignResult | null;
  onRunDefault: () => void;
  onGoToAnalyst: () => void;
  isRunning: boolean;
}

export const ResultsAxesView: React.FC<Props> = ({
  campaign,
  onRunDefault,
  onGoToAnalyst,
  isRunning,
}) => {
  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);
  const [tileFamilyFilter, setTileFamilyFilter] = React.useState<'ALL' | 'G' | 'R' | 'M'>('ALL');
  const [activeTraceTab, setActiveTraceTab] = React.useState<
    'partie_mediane' | 'victoire_arrachee' | 'effondrement'
  >('partie_mediane');

  React.useEffect(() => {
    if (campaign?.variants?.length) {
      setSelectedVariantId(campaign.variants[0].variantId);
    }
  }, [campaign?.campaignId]);

  if (!campaign || campaign.variants.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          Aucune campagne simulée pour le moment
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
          Lancez une campagne Monte-Carlo pour calculer le classement Pareto, les 5 axes
          d’évaluation (Rythme, Équilibre topologique, Coopération, Score, ICC), la valeur marginale
          des 30 tuiles par State Forking et les 3 traces narratives contrastées.
        </p>
        <button
          type="button"
          onClick={onRunDefault}
          disabled={isRunning}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {isRunning ? 'Simulation en cours...' : 'Lancer une première campagne'}
        </button>
      </div>
    );
  }

  const selected: VariantResult =
    campaign.variants.find((v) => v.variantId === selectedVariantId) ??
    campaign.variants[0];

  const filteredTiles = selected.tileTelemetry.filter((t) =>
    tileFamilyFilter === 'ALL' ? true : t.family === tileFamilyFilter,
  );

  const activeTrace = selected.traces[activeTraceTab];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{campaign.nom}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {campaign.totalGamesSimulated.toLocaleString('fr-FR')} parties
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{campaign.topologiesCount} topologies</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{campaign.durationMs} ms</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Tableau de Bord Multi-Critères (5 Axes v4.6)
          </h1>
        </div>
        <button
          type="button"
          onClick={onGoToAnalyst}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Analyser avec Gemini IA
        </button>
      </div>

      {/* Leaderboard */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Leaderboard des Variantes &amp; Front de Pareto
          </h2>
          <span className="text-xs text-slate-500">
            Cliquez sur une ligne pour inspecter ses 5 axes en détail
          </span>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="py-2.5 px-3 font-medium">Variante</th>
                <th className="py-2.5 px-3 text-right font-medium">Arbres Sauvés</th>
                <th className="py-2.5 px-3 text-right font-medium">Δ Socle</th>
                <th className="py-2.5 px-3 text-right font-medium">T8 / Gard / Rêve</th>
                <th className="py-2.5 px-3 text-right font-medium">σ Topos</th>
                <th className="py-2.5 px-3 text-right font-medium">Δ Coop</th>
                <th className="py-2.5 px-3 text-right font-medium">ICC Global</th>
                <th className="py-2.5 px-3 text-right font-medium">Score Composite</th>
                <th className="py-2.5 px-3 text-right font-medium">Pareto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaign.variants.map((v) => {
                const isSel = v.variantId === selected.variantId;
                return (
                  <tr
                    key={v.variantId}
                    onClick={() => setSelectedVariantId(v.variantId)}
                    className={`cursor-pointer transition-colors ${
                      isSel ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{v.label}</div>
                      <div className="font-mono text-[11px] text-slate-500">{v.variantId}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {v.scoreRatioMean}%
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                        v.deltaScoreVsBaseline > 0
                          ? 'text-emerald-700'
                          : v.deltaScoreVsBaseline < 0
                            ? 'text-red-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {v.deltaScoreVsBaseline >= 0 ? '+' : ''}
                      {v.deltaScoreVsBaseline}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {v.pctFinTour8}% / {v.pctFinGardiens}% / {v.pctFinReve}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {v.sigmaInterConfigs}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 tabular-nums">
                      {v.deltaCoop >= 0 ? '+' : ''}
                      {v.deltaCoop}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {v.iccGlobal}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {v.compositeScore}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {v.paretoOptimal ? (
                        <span className="text-emerald-700">Optimal</span>
                      ) : (
                        <span className="text-slate-400">Dominé</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Red Flags Banner */}
      {selected.redFlags.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Journal des Anomalies Automatiques (Red Flags — {selected.variantId})
          </div>
          <ul className="mt-2.5 space-y-1 text-xs text-amber-900">
            {selected.redFlags.map((rf, i) => (
              <li key={i}>• {rf}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 5 Axes Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Axe 1: Rythme & Fins */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Axe 1 · Rythme, Tension &amp; Fins de Partie
          </h3>
          <div className="space-y-2.5 text-xs">
            {[
              { label: 'Fin du contrat (Tour 8)', val: selected.pctFinTour8, color: 'bg-slate-700' },
              { label: 'Réveil de la Forêt (Gardiens)', val: selected.pctFinGardiens, color: 'bg-emerald-700' },
              { label: 'Sommeil du Contremaître (Rêve)', val: selected.pctFinReve, color: 'bg-sky-700' },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between">
                  <span className="text-slate-600">{row.label}</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {row.val}%
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${row.color}`} style={{ width: `${row.val}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
            <div>
              <div className="text-slate-500">Tour moyen de fin</div>
              <div className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                {selected.meanEndTurn} / 8
              </div>
            </div>
            <div>
              <div className="text-slate-500">Arrêts précoces (T1–T4)</div>
              <div
                className={`font-mono text-base font-semibold tabular-nums ${
                  selected.snowballAlert ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {selected.earlyStopTurns1to4Pct}%
              </div>
            </div>
          </div>
        </section>

        {/* Axe 4: Score & Courbe d'érosion */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Axe 4 · Calibration Score &amp; Érosion T1→T8
          </h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-slate-500">Moyenne</div>
              <div className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                {selected.scoreRatioMean}%
              </div>
            </div>
            <div>
              <div className="text-slate-500">P10 / P90</div>
              <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {selected.scoreRatioP10}% / {selected.scoreRatioP90}%
              </div>
            </div>
            <div>
              <div className="text-slate-500">Parcelles rasées</div>
              <div className="font-mono text-base font-semibold text-red-700 tabular-nums">
                {selected.razedParcelsPct}%
              </div>
            </div>
          </div>
          {/* Simple clean SVG erosion chart */}
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-1 flex justify-between text-[11px] text-slate-500">
              <span>Érosion moyenne par tour (Vert: Arbres · Ambre: Souches · Rouge: Rasées)</span>
            </div>
            <svg viewBox="0 0 320 96" className="h-24 w-full">
              <line x1="20" y1="80" x2="310" y2="80" stroke="#e2e8f0" strokeWidth="1" />
              <line x1="20" y1="10" x2="20" y2="80" stroke="#e2e8f0" strokeWidth="1" />
              {selected.erosionCurve.length > 1 && (
                <>
                  <polyline
                    fill="none"
                    stroke="#15803d"
                    strokeWidth="2"
                    points={selected.erosionCurve
                      .map((pt, idx) => {
                        const x = 25 + idx * (280 / Math.max(1, selected.erosionCurve.length - 1));
                        const y = 80 - (pt.treesPct / 100) * 68;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                  <polyline
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="1.5"
                    points={selected.erosionCurve
                      .map((pt, idx) => {
                        const x = 25 + idx * (280 / Math.max(1, selected.erosionCurve.length - 1));
                        const y = 80 - (pt.stumpsPct / 100) * 68;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                  <polyline
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="1.5"
                    strokeDasharray="3,2"
                    points={selected.erosionCurve
                      .map((pt, idx) => {
                        const x = 25 + idx * (280 / Math.max(1, selected.erosionCurve.length - 1));
                        const y = 80 - (pt.razedPct / 100) * 68;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                </>
              )}
              {selected.erosionCurve.map((pt, idx) => {
                const x = 25 + idx * (280 / Math.max(1, selected.erosionCurve.length - 1));
                return (
                  <text key={pt.turn} x={x - 5} y="93" fontSize="9" fill="#64748b">
                    T{pt.turn}
                  </text>
                );
              })}
            </svg>
          </div>
        </section>

        {/* Axe 5: Charge Cognitive & Axe 3 Coopération */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Axes 3 &amp; 5 · Coopération &amp; Charge Cognitive (ICC)
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-slate-500">Δ Coop (Heur. − Réflexe)</div>
              <div className="font-mono text-base font-semibold text-emerald-700 tabular-nums">
                {selected.deltaCoop >= 0 ? '+' : ''}
                {selected.deltaCoop} pts
              </div>
            </div>
            <div>
              <div className="text-slate-500">Δ Réflexion (Étape 2.2)</div>
              <div className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                +{selected.deltaReflexionStep2} pts
              </div>
            </div>
            <div>
              <div className="text-slate-500">Entropie des actions</div>
              <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {selected.actionEntropy} bits
              </div>
            </div>
            <div>
              <div className="text-slate-500">Pénalité d’Opacité (Oracle)</div>
              <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                +{selected.iccOpacite} pts
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3 text-xs">
            <div className="flex justify-between font-medium text-slate-700">
              <span>Indice de Charge Cognitive (ICC Global)</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {selected.iccGlobal}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
              <span>Lexical: {selected.iccStatique}</span>
              <span>Cascades: {selected.iccCascade}</span>
              <span>Calcul: {selected.iccCalcul}</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 tabular-nums">
              Parades/p: {selected.paradesPerGame} · Pièges: {selected.trapsPlacedPerGame} · Sabotages:{' '}
              {selected.sabotagesGainedPerGame} · Nids: {selected.nidsActivatedPerGame}
            </div>
          </div>
        </section>
      </div>

      {/* Axe 2: People & Regime Clusters */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="pb-3 text-sm font-semibold text-slate-900">
            Axe 2 · Biais par Peuple (M, R, O, H, E, I) — σ Topos = {selected.sigmaInterConfigs}
          </h3>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="py-2 px-3 font-medium">Peuple</th>
                <th className="py-2 px-3 text-right font-medium">Présences</th>
                <th className="py-2 px-3 text-right font-medium">Score Moyen</th>
                <th className="py-2 px-3 text-right font-medium">Taux Arrêt Anticipé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selected.peopleMetrics.map((pm) => (
                <tr key={pm.people}>
                  <td className="py-2 px-3 font-medium text-slate-900">
                    <span className="font-mono font-semibold">{pm.people}</span> · {pm.label}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {pm.gamesPresent}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {pm.meanScoreRatio}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {pm.earlyStopRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="pb-3 text-sm font-semibold text-slate-900">
            Clustering par Régimes de Comportement &amp; Deltas vs Socle
          </h3>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="py-2 px-3 font-medium">Régime de table</th>
                <th className="py-2 px-3 text-right font-medium">Configs</th>
                <th className="py-2 px-3 text-right font-medium">Score</th>
                <th className="py-2 px-3 text-right font-medium">Δ Socle</th>
                <th className="py-2 px-3 text-right font-medium">T8 / G / R</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selected.regimeClusters.map((rc) => (
                <tr key={rc.regime}>
                  <td className="py-2 px-3 font-medium text-slate-900">{rc.regime}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {rc.configCount}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {rc.meanScoreRatio}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums">
                    {rc.deltaVsBaseline >= 0 ? '+' : ''}
                    {rc.deltaVsBaseline}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {rc.winModeDistribution.tour8}/{rc.winModeDistribution.gardiens}/
                    {rc.winModeDistribution.reve}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* 30 Tiles Health Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Matrice de Santé des 30 Tuiles &amp; Impact Marginal (State Forking ΔV)
            </h3>
            <p className="text-xs text-slate-500">
              Identifie les tuiles mortes (&lt; 10%), auto-win (&gt; 90%) et le ΔV arbres sauvés.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {(
              [
                { id: 'ALL', label: 'Toutes (30)' },
                { id: 'G', label: 'Gardiens (15)' },
                { id: 'R', label: 'Rêves (10)' },
                { id: 'M', label: 'Croissance (5)' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTileFamilyFilter(f.id)}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  tileFamilyFilter === f.id ? 'bg-white text-slate-900' : 'text-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto border-t border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="py-2 px-3 font-medium">Tuile</th>
                <th className="py-2 px-3 font-medium">Famille</th>
                <th className="py-2 px-3 text-right font-medium">Pick Rate</th>
                <th className="py-2 px-3 text-right font-medium">Tour Pose</th>
                <th className="py-2 px-3 text-right font-medium">Activ./Partie</th>
                <th className="py-2 px-3 text-right font-medium">Upgrade F2</th>
                <th className="py-2 px-3 text-right font-medium">Sacrifice</th>
                <th className="py-2 px-3 text-right font-medium">ΔV Forking</th>
                <th className="py-2 px-3 text-right font-medium">Inversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTiles.map((tt) => (
                <tr key={tt.code} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono font-semibold text-slate-900">{tt.code}</td>
                  <td className="py-2 px-3 text-slate-600">{tt.family}</td>
                  <td
                    className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${
                      tt.availableCount > 0 && tt.pickRateWhenAvailable < 10
                        ? 'text-red-700'
                        : tt.pickRateWhenAvailable > 90
                          ? 'text-amber-700'
                          : 'text-slate-900'
                    }`}
                  >
                    {tt.pickRateWhenAvailable}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {tt.meanTurnBuilt || '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {tt.activationsPerGame}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {tt.upgradeF2Rate}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {tt.sacrificeRate}%
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono font-medium tabular-nums ${
                      tt.forkingDeltaV > 0
                        ? 'text-emerald-700'
                        : tt.forkingDeltaV < 0
                          ? 'text-red-700'
                          : 'text-slate-500'
                    }`}
                  >
                    {tt.forkingDeltaV >= 0 ? '+' : ''}
                    {tt.forkingDeltaV}%
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                    {tt.forkingInversionRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3 Contrastive Narrative Traces */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            Florilège de Trajectoires Contrastées (Traces Narratives Réelles)
          </h3>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {(
              [
                { id: 'partie_mediane', label: 'Partie médiane' },
                { id: 'victoire_arrachee', label: 'Victoire à l’arraché' },
                { id: 'effondrement', label: 'Effondrement' },
              ] as const
            ).map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setActiveTraceTab(tb.id)}
                className={`rounded-md px-3 py-1 font-medium ${
                  activeTraceTab === tb.id ? 'bg-white text-slate-900' : 'text-slate-600'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{activeTrace.topologyDesc}</span>
          <span aria-hidden="true">·</span>
          <span>Fin : {activeTrace.endCondition} (Tour {activeTrace.finalTurn})</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono font-semibold text-emerald-700 tabular-nums">
            Score : {activeTrace.finalTrees} / {activeTrace.initialTrees} arbres ({activeTrace.scoreRatio}%)
          </span>
        </div>

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="py-2 px-3 font-medium">Tour</th>
                <th className="py-2 px-3 text-right font-medium">Arbres</th>
                <th className="py-2 px-3 text-right font-medium">Souches</th>
                <th className="py-2 px-3 text-right font-medium">Rasées</th>
                <th className="py-2 px-3 text-right font-medium">Gardiens</th>
                <th className="py-2 px-3 text-right font-medium">Rêve Rang</th>
                <th className="py-2 px-3 font-medium">Événements clés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTrace.steps.map((st) => (
                <tr key={st.tour}>
                  <td className="py-2 px-3 font-mono font-semibold text-slate-900">T{st.tour}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{st.arbresDebout}</td>
                  <td className="py-2 px-3 text-right font-mono text-amber-700 tabular-nums">{st.souches}</td>
                  <td className="py-2 px-3 text-right font-mono text-red-700 tabular-nums">{st.parcellesRasees}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{st.gardiensPoses}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {st.revePlusAvance || '—'}
                  </td>
                  <td className="py-2 px-3 text-slate-700">{st.resume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
