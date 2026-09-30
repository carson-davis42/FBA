import { Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MetaFile, PastAsset, PastTransactionsFile, PlayersFile, TransactionsFile } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc } from '../api';
import { PageHeader } from '../components/PageHeader';
import { PlayerLink } from './PlayerLink';
import { findTeam, TeamAbbr, TeamFull, useFbaTeams } from './useTeams';
import './history.css';

const APP_FIRST_SEASON = 79;
const APP_TYPES = new Set(['signed', 'resigned', 'released', 'cut', 'trade', 'drafted']);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Asset({ asset, players }: { asset: PastAsset; players: PlayersFile }) {
  if (!asset.playerId) return <>{asset.text}</>;
  return <>{asset.pos ? `${asset.pos} ` : ''}<PlayerLink id={asset.playerId} players={players} /></>;
}

export function PastTransactionsPage() {
  const [params, setParams] = useSearchParams();
  const meta = useDoc<MetaFile>('meta.json');
  const past = useDoc<PastTransactionsFile>('leagues/fba/pastTransactions.json');
  const players = useDoc<PlayersFile>('players.json');
  const fb = useFbaTeams();

  const imported = (past.data?.seasons ?? []).map(s => s.season);
  const current = meta.data?.currentSeason ?? null;
  const seasonParam = Number(params.get('season'));
  const defaultSeason = imported.length > 0 ? Math.max(...imported) : current;
  const season = Number.isInteger(seasonParam) && seasonParam > 0 ? seasonParam : defaultSeason;
  const team = params.get('team') ?? '';

  const settled = docSettled(meta) && docSettled(past) && docSettled(players) && fb.settled;
  const entries = past.data?.seasons.find(s => s.season === season)?.entries ?? [];
  const appDoc = useDoc<TransactionsFile>(settled && season !== null && season >= APP_FIRST_SEASON ? `leagues/fba/S${season}/transactions.json` : null);

  const failure = docFailure(meta) ?? docFailure(past) ?? docFailure(players) ?? (appDoc.data ? undefined : docFailure(appDoc));
  if (failure && settled) return <p className="error">Couldn't load the transactions: {failure.message}</p>;
  if (!settled || (season !== null && season >= APP_FIRST_SEASON && !docSettled(appDoc))) return <p className="muted">Loading…</p>;

  const seasons = new Set<number>(imported);
  if (season !== null) seasons.add(season);
  if (current !== null) {
    seasons.add(current);
    for (let s = APP_FIRST_SEASON; s <= current; s++) seasons.add(s);
  }
  const seasonList = [...seasons].sort((a, b) => b - a);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const header = (
    <>
      <PageHeader title="Transactions" />
      <div className="filters">
        <label>Season{' '}
          <select value={season ?? ''} onChange={e => setParam('season', e.target.value)}>
            {seasonList.map(s => <option key={s} value={s}>S{s}</option>)}
          </select>
        </label>
        {' '}
        <label>Team{' '}
          <select value={team} onChange={e => setParam('team', e.target.value)}>
            <option value="">All teams</option>
            {fb.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
        </label>
      </div>
    </>
  );

  const appEntries = (appDoc.data?.entries ?? []).filter(e => APP_TYPES.has(e.type) && (!team || e.teams.includes(team)));
  const hasApp = !!appDoc.data;
  if (entries.length === 0 && !hasApp) {
    return (
      <section className="stack">
        {header}
        <p className="muted">
          {past.data ? `No transactions on record for S${season}.` : 'No past transactions yet. Run npm run import -- --transactions --data data.'}
        </p>
      </section>
    );
  }

  const playerDoc = players.data ?? { nextId: 1, players: {} };
  const teamFull = (id: string) => (
    <TeamFull teams={fb.teams} franchises={fb.franchises} teamId={id} name={findTeam(fb.teams, id)?.name ?? id} season={season ?? 0} variant="abbr" />
  );
  const trades = entries.flatMap(e => e.kind === 'trade' && (!team || e.teamIds.includes(team)) ? [e] : []);
  const moves = entries.flatMap(e => e.kind !== 'trade' && (!team || e.teamId === team) ? [e] : []);

  return (
    <section className="stack">
      {header}
      {trades.map((t, i) => {
        const receivers = [...new Set(t.moves.map(m => m.to))];
        return (
          <article key={i} className="card tx-trade">
            <div className="tx-trade-head">
              {t.teamIds.map((id, j) => <Fragment key={id}>{j > 0 && ' ⇄ '}{teamFull(id)}</Fragment>)}
              {t.when && <span className="muted">{t.when}</span>}
            </div>
            {receivers.map(to => (
              <div key={to}>
                → {teamFull(to)}:{' '}
                {t.moves.filter(m => m.to === to).map((m, k) => (
                  <Fragment key={k}>{k > 0 && ', '}<Asset asset={m.asset} players={playerDoc} /></Fragment>
                ))}
              </div>
            ))}
            {t.notes.map((n, k) => <div key={k} className="muted">{n}</div>)}
          </article>
        );
      })}
      {moves.length > 0 && (
        <div className="table-wrap">
          <table className="stat-table">
            <thead><tr><th>Team</th><th>Move</th><th>Player/asset</th><th>When</th></tr></thead>
            <tbody>
              {moves.map((m, i) => (
                <tr key={i}>
                  <td>{teamFull(m.teamId)}</td>
                  <td>{cap(m.kind)}</td>
                  <td><Asset asset={m.asset} players={playerDoc} /></td>
                  <td>{m.when ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasApp && (
        <div>
          <h2 className="section-title">Moves in the app</h2>
          {appEntries.length === 0 && <p className="muted">No moves yet.</p>}
          <ul className="tx-feed">
            {[...appEntries].reverse().map(e => (
              <li key={e.seq} className="tx-row card">
                <div className="tx-main">
                  <div className="tx-head">
                    {e.teams.map(id => <TeamAbbr key={id} teams={fb.teams} teamId={id} season={season ?? 0} />)}
                    <span className="badge">{e.type}</span>
                  </div>
                  {e.lines.map(l => <div key={l} className="tx-line">{l}</div>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
