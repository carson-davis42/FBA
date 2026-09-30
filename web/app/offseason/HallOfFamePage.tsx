import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  addNominees, candidates, CLASS_SIZE, editNominee, freeNameCard, HOF_PATH, HOF_STEP, induct, NOMINEE_CAP, prefillCard, removeNominee,
} from '../../engine/offseason/hallOfFame';
import { calendarProblem, type WritesResult } from '../../engine/season/moves';
import type { CalendarFile, HallOfFameFile, HofCard, MetaFile, PlayerBiosFile, PlayersFile, TransactionsFile } from '../../engine/shared/types';
import { useDoc, useHistory, useSaving } from '../api';
import { SkippedWarning } from '../history/PlayerLink';
import { commitDocs, newBatchId } from '../roster/commit';
import '../pages/league.css';
import '../pages/roster.css';

type Tab = 'hall' | 'nominees';

/** A nominee's identity for the induct ticks: the player id, or the name when the card isn't linked. */
const cardKey = (card: HofCard): string => card.playerId ?? `name:${card.name.trim().toLowerCase()}`;

const linesOf = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(l => l !== '');

function Card({ card, children }: { card: HofCard; children?: React.ReactNode }) {
  return (
    <div className="hof-card">
      <h3>{card.name}</h3>
      <div className="muted">Retired {card.retiredSeason}</div>
      {children}
    </div>
  );
}

/** The Hall of Fame (/league/fba/hall-of-fame): inducted classes, and the nominee list with candidates and induction. */
export function HallOfFamePage() {
  const [params] = useSearchParams();
  const meta = useDoc<MetaFile>('meta.json');
  const n = meta.data?.currentSeason;
  const calendar = useDoc<CalendarFile>(n === undefined ? null : 'calendar.json');
  const players = useDoc<PlayersFile>(n === undefined ? null : 'players.json');
  const hof = useDoc<HallOfFameFile>(n === undefined ? null : HOF_PATH);
  const txPath = n === undefined ? null : `leagues/fba/S${n}/transactions.json`;
  const tx = useDoc<TransactionsFile>(txPath);
  const bios = useDoc<PlayerBiosFile>('leagues/fba/playerBios.json');
  const history = useHistory('fba');
  const saving = useSaving();
  const [picked, setPicked] = useState<string[]>([]);
  const [inductees, setInductees] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [retiredSeason, setRetiredSeason] = useState('');
  const [actionError, setActionError] = useState('');

  const list = useMemo(() => (hof.data && players.data ? candidates(hof.data, players.data) : []), [hof.data, players.data]);

  const err = meta.error ?? calendar.error ?? players.error ?? tx.error ?? (hof.missing ? undefined : hof.error) ?? (bios.missing ? undefined : bios.error) ?? history.error;
  if (err) return <p className="error">Couldn't load the Hall of Fame: {err.message}</p>;
  if (hof.missing) {
    return <section><h1>Hall of Fame</h1><p>Import the Hall of Fame first: run "npm run import -- --hall-of-fame" in web/.</p></section>;
  }
  if (n === undefined || !calendar.data || !players.data || !hof.data || !tx.data || (!bios.data && !bios.missing) || !history.seasons) return <p className="muted">Loading…</p>;
  const doc = hof.data;
  const cal = calendar.data;
  const summaries = history.seasons;
  const bioOf = (id: string) => bios.data?.bios.find(b => b.playerId === id) ?? null;
  const asked = params.get('tab');
  const tab: Tab = asked === 'nominees' ? 'nominees' : 'hall';
  const tabLink = (id: Tab, label: string) => (
    <Link role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} to={`/league/fba/hall-of-fame?tab=${id}`}>{label}</Link>
  );

  const versions = { [HOF_PATH]: hof.version, [txPath!]: tx.version, 'calendar.json': calendar.version };
  const run = async (result: WritesResult): Promise<boolean> => {
    setActionError('');
    if (!result.ok) {
      setActionError(result.problems.join('; '));
      return false;
    }
    try {
      await commitDocs(result.label, result.writes, versions);
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    }
  };
  const settle = () => { setPicked([]); setInductees([]); };

  const hall = <p><Link to="/history/fba/hall-of-fame">See the Hall of Fame in History</Link></p>;

  const toggle = <T,>(items: T[], set: (v: T[]) => void, item: T) =>
    set(items.includes(item) ? items.filter(x => x !== item) : [...items, item]);
  const problem = calendarProblem(cal, HOF_STEP, 'The Hall of Fame class is inducted');
  const need = Math.min(CLASS_SIZE, doc.nominees.length);

  const nominees = (
    <div>
      <h2>Nominees</h2>
      <p>{doc.nominees.length} of {NOMINEE_CAP}</p>
      {doc.nominees.length === 0 && <p className="muted">The class needs nominees: add one (from the candidates or by name) before inducting.</p>}
      <div className="hof-grid">
        {doc.nominees.map((card, i) => (
          <Card key={`${i}${card.name}${card.lines.join('\n')}`} card={card}>
            <textarea
              aria-label={`${card.name} lines`}
              rows={Math.max(3, card.lines.length + 1)}
              defaultValue={card.lines.join('\n')}
              onBlur={e => {
                const lines = linesOf(e.currentTarget.value);
                if (lines.join('\n') !== card.lines.join('\n')) void run(editNominee(doc, i, { lines }));
              }}
            />
            <p>
              <label><input type="checkbox" aria-label={`Induct ${card.name}`} checked={inductees.includes(cardKey(card))} onChange={() => toggle(inductees, setInductees, cardKey(card))} /> Induct</label>{' '}
              <button className="btn" disabled={saving} onClick={() => {
                if (!window.confirm(`Remove ${card.name} from the nominees? They can't be nominated again.`)) return;
                void run(removeNominee(doc, i)).then(ok => { if (ok) settle(); });
              }}>Remove</button>
            </p>
          </Card>
        ))}
      </div>
      <p>
        <button className="btn primary" disabled={saving || Boolean(problem)} onClick={() => {
          void run(induct(
            { season: n, calendar: cal, hof: doc, players: players.data!, tx: tx.data!, summaries },
            doc.nominees.flatMap((c, i) => (inductees.includes(cardKey(c)) ? [i] : [])),
            { batchId: newBatchId() },
          )).then(ok => { if (ok) settle(); });
        }}>Induct class</button>
        {' '}<span className="muted">Tick {need} {need === 1 ? 'nominee' : 'nominees'}, then induct them as the S{n} class.</span>
      </p>
      {problem && <p className="muted">{problem}</p>}

      <h2>Candidates</h2>
      {list.length === 0 ? <p className="muted">No retired players are waiting to be nominated.</p> : (
        <>
          <ul aria-label="Candidates">
            {list.map(c => {
              const card = prefillCard(c, summaries, bioOf(c.playerId), doc);
              return (
                <li key={c.playerId}>
                  <label><input type="checkbox" aria-label={`Select ${c.name}`} checked={picked.includes(c.playerId)} onChange={() => toggle(picked, setPicked, c.playerId)} /> <strong>{c.name}</strong></label>{' '}
                  <span className="muted">Retired {card.retiredSeason}</span>
                  <ul>{card.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
                </li>
              );
            })}
          </ul>
          <p>
            <button className="btn" disabled={saving || picked.length === 0} onClick={() => {
              const cards = list.filter(c => picked.includes(c.playerId)).map(c => prefillCard(c, summaries, bioOf(c.playerId), doc));
              void run(addNominees(doc, cards)).then(ok => { if (ok) settle(); });
            }}>Add selected</button>
          </p>
        </>
      )}

      <h2>Add by name</h2>
      <div className="hof-form">
        <label>Name<br /><input value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Retired season<br /><input value={retiredSeason} onChange={e => setRetiredSeason(e.target.value)} placeholder="S12" /></label>
        <button className="btn" disabled={saving || name.trim() === '' || retiredSeason.trim() === ''} onClick={() => {
          void run(addNominees(doc, [freeNameCard(name, retiredSeason)])).then(ok => { if (ok) { setName(''); setRetiredSeason(''); settle(); } });
        }}>Add nominee</button>
      </div>
    </div>
  );

  return (
    <section>
      <h1>Hall of Fame</h1>
      <div className="tabs" role="tablist">{tabLink('hall', 'Hall')}{tabLink('nominees', 'Nominees')}</div>
      <SkippedWarning errors={history.errors} />
      {actionError && <p className="error">{actionError}</p>}
      {tab === 'hall' ? hall : nominees}
    </section>
  );
}
