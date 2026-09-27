import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { futureSeasons, owedFrom, pickLabel } from '../../engine/roster/picks';
import { makeTrade, type TradeAsset } from '../../engine/roster/trade';
import type { PickCondition, TeamsFile } from '../../engine/shared/types';
import { useDoc, useSaving } from '../api';
import { commitMove, newBatchId } from '../roster/commit';
import { useRosterState } from '../roster/useRosterState';
import './roster.css';

type Kind = PickCondition['kind'];

function conditionFor(kind: Kind, n: number, text: string, from: string, to: string, betterTo: string): PickCondition {
  switch (kind) {
    case 'none': return { kind: 'none' };
    case 'top': return { kind: 'top', n: Math.max(1, n) };
    case 'lottery': return { kind: 'lottery' };
    case 'swap': return { kind: 'swap', otherTeam: to, betterTo: betterTo === from ? from : to };
    case 'custom': return { kind: 'custom', text: text || 'custom condition' };
  }
}

export function TradePage() {
  const { league = '' } = useParams();
  const [search] = useSearchParams();
  const { state, versions, error } = useRosterState();
  const lg = league === 'fbad2' ? 'fbad2' : 'fba';
  const { data: teams } = useDoc<TeamsFile>(`leagues/${lg}/teams.json`);
  const [teamIds, setTeamIds] = useState<string[]>(search.get('team') ? [search.get('team')!] : []);
  const [assets, setAssets] = useState<TradeAsset[]>([]);
  const [pickOpts, setPickOpts] = useState<Record<string, { kind: Kind; n: number; text: string; betterTo: string }>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saving = useSaving();

  if (league !== 'fba' && league !== 'fbad2') return <p className="error">Trades are for the FBA and FBAD2.</p>;
  if (error) return <p className="error">Couldn't load rosters: {error.message}</p>;
  if (!state || !teams) return <p className="muted">Loading…</p>;

  const rosters = lg === 'fba' ? state.fba : state.d2;
  const locked = (lg === 'fba' ? state.fba : state.d2).locked;
  const nameOfTeam = (t: string) => teams.teams.find(x => x.teamId === t)?.name ?? t;
  const defaultTo = (from: string) => teamIds.find(t => t !== from) ?? from;
  const pickKey = (from: string, season: number) => `${from}-${season}`;

  const withConditions = assets.map(a => {
    if (a.kind !== 'ownPick') return a;
    const o = pickOpts[pickKey(a.from, a.season)] ?? { kind: 'none' as Kind, n: 1, text: '', betterTo: a.to };
    return { ...a, condition: conditionFor(o.kind, o.n, o.text, a.from, a.to, o.betterTo) };
  });
  const preview = teamIds.length >= 2 && assets.length ? makeTrade(state, { league: lg, teams: teamIds, assets: withConditions }, { batchId: 'preview' }) : null;
  const txKey = lg === 'fba' ? 'fbaTx' : 'd2Tx';
  const lines = preview?.ok ? preview.state[txKey].entries.at(-1)!.lines : [];

  const canTrade = teamIds.length >= 2;
  const toggle = (asset: TradeAsset, matches: (a: TradeAsset) => boolean) => {
    if (!canTrade) return;
    setAssets(prev => (prev.some(matches) ? prev.filter(a => !matches(a)) : [...prev, asset]));
  };
  const setDest = (i: number, to: string) => setAssets(prev => prev.map((a, j) => (j === i ? { ...a, to } : a)));

  const save = async () => {
    const result = makeTrade(state, { league: lg, teams: teamIds, assets: withConditions }, { batchId: newBatchId() });
    if (!result.ok) return;
    setBusy(true);
    setSaveError('');
    try {
      await commitMove(result, versions);
      setAssets([]);
      setPickOpts({});
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>{lg === 'fba' ? 'FBA' : 'FBAD2'} trade</h1>
      {locked && <p className="muted">S{state.season} rosters are final; trades are closed.</p>}
      <div className="form-row">
        <label>Add team
          <select value="" onChange={e => e.target.value && setTeamIds(ids => [...ids, e.target.value])}>
            <option value="">Choose…</option>
            {teams.teams.filter(t => !teamIds.includes(t.teamId)).map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
        {teamIds.map(t => (
          <button key={t} className="btn" onClick={() => {
            setTeamIds(ids => ids.filter(x => x !== t));
            setAssets(a => a.filter(x => x.from !== t && x.to !== t));
            setPickOpts(p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(`${t}-`))));
          }}>
            {t} ✕
          </button>
        ))}
      </div>
      {!canTrade && <p className="muted">Add a second team to start a trade.</p>}

      <div className="trade-cols">
        {teamIds.map(from => (
          <section key={from} className="card" aria-label={nameOfTeam(from)}>
            <h3>{nameOfTeam(from)}</h3>
            {(rosters.teams[from] ?? []).filter(e => e.playerId).map(e => {
              const i = assets.findIndex(a => a.kind === 'player' && a.playerId === e.playerId);
              const name = state.players.players[e.playerId!]?.name ?? 'Unnamed';
              return (
                <div key={e.playerId} className={`asset ${i >= 0 ? 'sending' : ''}`}>
                  <span onClick={() => toggle({ kind: 'player', playerId: e.playerId!, from, to: defaultTo(from) }, a => a.kind === 'player' && a.playerId === e.playerId)}>
                    {e.position} <b>{name}</b> {e.rating ?? '—'}{lg === 'fba' && e.contractEnd != null ? ` · S${e.contractEnd} $${e.contractAmount}` : ''}
                  </span>
                  {i >= 0 && teamIds.length > 2 && (
                    <select aria-label={`Send ${name} to`} value={assets[i].to} onChange={ev => setDest(i, ev.target.value)}>
                      {teamIds.filter(t => t !== from).map(t => <option key={t} value={t}>→ {t}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
            {lg === 'fba' && (
              <>
                <h3>Draft picks</h3>
                {futureSeasons(state.season).map(season => {
                  const key = pickKey(from, season);
                  const i = assets.findIndex(a => a.kind === 'ownPick' && a.from === from && a.season === season);
                  const owed = owedFrom(state.picks.obligations, season, from);
                  const opt = pickOpts[key] ?? { kind: 'none' as Kind, n: 1, text: '', betterTo: defaultTo(from) };
                  const setOpt = (patch: Partial<typeof opt>) => setPickOpts(p => ({ ...p, [key]: { ...opt, ...patch } }));
                  return (
                    <div key={season} className={`asset ${i >= 0 ? 'sending' : ''}`}>
                      <span onClick={() => toggle({ kind: 'ownPick', season, from, to: defaultTo(from), condition: { kind: 'none' } }, a => a.kind === 'ownPick' && a.from === from && a.season === season)}>
                        S{season} own pick{owed.length ? ` (owed: ${owed.map(o => `${o.owner} ${pickLabel(o).replace(/^.*\)\(/, '(')}`).join(', ')})` : ''}
                      </span>
                      {i >= 0 && (
                        <span className="form-row">
                          <select aria-label={`S${season} condition`} value={opt.kind} onChange={e => setOpt({ kind: e.target.value as Kind })}>
                            <option value="none">Unprotected</option>
                            <option value="top">Top-N protected</option>
                            <option value="lottery">Lottery protected</option>
                            <option value="swap">Pick swap</option>
                            <option value="custom">Custom</option>
                          </select>
                          {opt.kind === 'top' && <input aria-label={`S${season} protected top`} type="number" min={1} max={29} value={opt.n} onChange={e => setOpt({ n: Number(e.target.value) })} />}
                          {opt.kind === 'swap' && (
                            <select aria-label={`S${season} better pick to`} value={opt.betterTo} onChange={e => setOpt({ betterTo: e.target.value })}>
                              <option value={from}>{from} gets better</option>
                              <option value={assets[i].to}>{assets[i].to} gets better</option>
                            </select>
                          )}
                          {opt.kind === 'custom' && <input aria-label={`S${season} custom condition`} value={opt.text} onChange={e => setOpt({ text: e.target.value })} />}
                          {teamIds.length > 2 && (
                            <select aria-label={`Send S${season} pick to`} value={assets[i].to} onChange={ev => setDest(i, ev.target.value)}>
                              {teamIds.filter(t => t !== from).map(t => <option key={t} value={t}>→ {t}</option>)}
                            </select>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
                {state.picks.obligations.filter(o => o.owner === from).map(o => {
                  const i = assets.findIndex(a => a.kind === 'pick' && a.obligationId === o.id);
                  return (
                    <div key={o.id} className={`asset ${i >= 0 ? 'sending' : ''}`}>
                      <span onClick={() => toggle({ kind: 'pick', obligationId: o.id, from, to: defaultTo(from) }, a => a.kind === 'pick' && a.obligationId === o.id)}>
                        {pickLabel(o)}
                      </span>
                      {i >= 0 && teamIds.length > 2 && (
                        <select aria-label={`Send ${pickLabel(o)} to`} value={assets[i].to} onChange={ev => setDest(i, ev.target.value)}>
                          {teamIds.filter(t => t !== from).map(t => <option key={t} value={t}>→ {t}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </section>
        ))}
      </div>

      <div className="card">
        <h3>Summary</h3>
        {lines.length > 0 && <ul className="tx-list">{lines.map(l => <li key={l}>{l}</li>)}</ul>}
        {preview && !preview.ok && <ul className="problems">{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>}
        {preview?.ok && preview.warnings.length > 0 && <p className="muted">Fix before free agency ends: {preview.warnings.join('; ')}</p>}
        {saveError && <p className="error">Save failed: {saveError}</p>}
        <button className="btn primary" disabled={locked || !preview?.ok || busy || saving} onClick={save}>Make trade</button>
      </div>
    </section>
  );
}
