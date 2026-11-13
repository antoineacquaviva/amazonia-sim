import React from 'react';
import type { TopologyConfig } from '../sim/types.ts';
import { PEOPLES, TILE_BY_ID, getTileForOrderedPair } from '../sim/topology.ts';

export const TopologyExplorerView: React.FC = () => {
  const [oriented, setOriented] = React.useState(false);
  const [nFilter, setNFilter] = React.useState<'ALL' | 3 | 4 | 5 | 6>('ALL');
  const [topologies, setTopologies] = React.useState<TopologyConfig[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/topologies?oriented=${oriented}`)
      .then((r) => r.json())
      .then((data) => {
        setTopologies(data.topologies ?? []);
      })
      .finally(() => setLoading(false));
  }, [oriented]);

  const filtered = React.useMemo(() => {
    if (nFilter === 'ALL') return topologies;
    return topologies.filter((t) => t.N === nFilter);
  }, [topologies, nFilter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Annexe de Conception v4.6 · C(6, N) × (N−1)!/2 = 197 graphes · 394 orientées
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Énumérateur Topologique Exact &amp; Matrice des 30 Tuiles
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setOriented(false)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                !oriented ? 'bg-white text-slate-900' : 'text-slate-600'
              }`}
            >
              197 Sans Miroir
            </button>
            <button
              type="button"
              onClick={() => setOriented(true)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                oriented ? 'bg-white text-slate-900' : 'text-slate-600'
              }`}
            >
              394 Orientées
            </button>
          </div>

          <div className="flex rounded-lg bg-slate-100 p-1 text-xs">
            {(['ALL', 3, 4, 5, 6] as const).map((n) => (
              <button
                key={String(n)}
                type="button"
                onClick={() => setNFilter(n)}
                className={`rounded-md px-2.5 py-1.5 font-mono font-medium ${
                  nFilter === n ? 'bg-white text-slate-900' : 'text-slate-600'
                }`}
              >
                {n === 'ALL' ? 'Tous' : `${n}J`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reference 6x6 Matrix from PDF Page 4 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="pb-3 text-base font-semibold text-slate-900">
          Matrice Officielle des 30 Tuiles de Synergie (v4.6 Page 4)
        </h2>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-medium">Peuple 1 (Ligne) \ Peuple 2 (Col.)</th>
                {PEOPLES.map((p) => (
                  <th key={p.code} className="py-2.5 px-3 font-medium">
                    <span className="font-mono font-semibold">{p.code}</span> · {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PEOPLES.map((rowP) => (
                <tr key={rowP.code}>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    <span className="font-mono font-semibold">{rowP.code}</span> · {rowP.label}
                  </td>
                  {PEOPLES.map((colP) => {
                    if (rowP.code === colP.code) {
                      return (
                        <td key={colP.code} className="py-2.5 px-3 text-slate-300">
                          —
                        </td>
                      );
                    }
                    const tile = getTileForOrderedPair(rowP.code, colP.code);
                    const color =
                      tile.family === 'G'
                        ? 'text-emerald-800'
                        : tile.family === 'R'
                          ? 'text-sky-800'
                          : 'text-amber-800';
                    return (
                      <td key={colP.code} className={`py-2.5 px-3 font-mono ${color}`}>
                        <span className="font-semibold">{tile.code}</span>{' '}
                        <span className="text-[11px] text-slate-400">
                          ({rowP.code},{colP.code}){tile.isIntra ? ' Intra' : ''}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Configurations table */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Configurations Générées ({filtered.length})
          </h2>
        </div>
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Génération des graphes topologiques...
          </div>
        ) : (
          <div className="max-h-[460px] overflow-y-auto border-t border-slate-100">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="py-2 px-3 font-medium">ID</th>
                  <th className="py-2 px-3 font-medium">N</th>
                  <th className="py-2 px-3 font-medium">Cercle des Peuples</th>
                  <th className="py-2 px-3 font-medium">Régime</th>
                  <th className="py-2 px-3 text-right font-medium">G / R / M</th>
                  <th className="py-2 px-3 text-right font-medium">Intra (Anim/Onir)</th>
                  <th className="py-2 px-3 font-medium">Lot des 2N Tuiles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-slate-500 tabular-nums">#{t.id}</td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">{t.N}J</td>
                    <td className="py-2 px-3 font-mono font-medium text-slate-900">
                      {t.peoples.join(' – ')}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{t.regimeTag}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {t.nbG} / {t.nbR} / {t.nbM}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600 tabular-nums">
                      {t.intraAnimalCount} / {t.intraOniriqueCount}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                      {t.lisiereTiles
                        .map(([a, b]) => `${TILE_BY_ID[a]?.code}+${TILE_BY_ID[b]?.code}`)
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
