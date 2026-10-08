import { useCallback, useState, type ReactNode } from 'react';
import { asgTeams } from '../../engine/allstar/asgDraft';
import { runAsg } from '../../engine/allstar/asgGame';
import type { AllStarResult } from '../../engine/allstar/common';
import { runDunk, runFivePoint } from '../../engine/allstar/contests';
import { total } from '../../engine/allstar/dice';
import { runYoungStar, startYsgDraft, ysgAvailable, ysgOnClock, ysgPick, ysgTeams } from '../../engine/allstar/youngStars';
import type { ContestResult, ExhibitionGame } from '../../engine/shared/types';
import { PlayerName } from '../components/PlayerName';
import { POSITIONS } from '../../engine/roster/rules';
import { ACCENT_SIDES } from '../season/GameViews';
import { DiceReveal, type RevealLine, StaticLines, StepCard } from './DiceReveal';
import { AsgGame, YsgTournament } from './ExhibitionViews';
import type { StepProps } from './types';

/** A piece of a reveal line: plain text, or a player (shown by name, linked to the profile). */
export type Part = string | { id: string };

/** One reveal line from its parts: the plain text for tests and logs, and the same line with player names linked. */
/** Parts as one piece of markup: text as is, players as profile links. */
export const partsNode = (name: (id: string) => string, parts: Part[]): ReactNode => (
  <>{parts.map((p, i) => (typeof p === 'string' ? p : <PlayerName key={i} id={p.id} name={name(p.id)} />))}</>
);

export function line(name: (id: string) => string, group: string, parts: Part[], extra: Partial<RevealLine> = {}): RevealLine {
  return {
    group,
    text: parts.map(p => (typeof p === 'string' ? p : name(p.id))).join(''),
    node: partsNode(name, parts),
    ...extra,
  };
}

export function contestLines(result: ContestResult, name: (id: string) => string): RevealLine[] {
  const out: RevealLine[] = [];
  const L = (group: string, parts: Part[], extra?: Partial<RevealLine>) => out.push(line(name, group, parts, extra));
  result.rounds.forEach((round, r) => {
    const group = `Round ${r + 1}`;
    // Everyone's first roll, then everyone's second, then their third.
    const perPlayer = Math.max(...round.players.map(id => round.rolls[id].length));
    for (let k = 0; k < perPlayer; k++) {
      for (const id of round.players) {
        const dice = round.rolls[id][k];
        if (dice) L(`${group} · Roll ${k + 1}`, [{ id }, ` roll ${k + 1}: ${total(dice)}`], { dice, who: partsNode(name, [{ id }]), cell: { table: group, row: id, rowNode: <PlayerName id={id} name={name(id)} />, col: k, carry: r > 0 ? result.rounds[r - 1].totals[id] ?? 0 : 0 } });
      }
    }
    for (const ro of round.rollOffs) for (const rnd of ro.rounds) for (const [id, dice] of Object.entries(rnd)) L(group, ['Roll-off: ', { id }, ` ${total(dice)}`], { dice, who: partsNode(name, ['Roll-off · ', { id }]) });
    const standings = [...round.players].sort((a, b) => round.totals[b] - round.totals[a]);
    L(group, ['Totals: ', ...standings.flatMap((id, i): Part[] => [i > 0 ? ', ' : '', { id }, ` ${round.totals[id]}`])]);
    L(group, ['Advancing: ', ...round.advanced.flatMap((id, i): Part[] => [i > 0 ? ', ' : '', { id }])], { eliminated: { table: group, rows: round.players.filter(id => !round.advanced.includes(id)) } });
  });
  L('Result', ['Winner: ', { id: result.winner }]);
  return out;
}

/** "Team X 150–140", or "Team X 150–148 (OT)" when overtime was needed, as text and name parts. */
export function gameResultParts(game: ExhibitionGame, label: (team: number) => Part[]): Part[] {
  const side = game.teams.indexOf(game.winner);
  const ot = game.ot === 0 ? '' : game.ot === 1 ? ' (OT)' : ` (${game.ot}OT)`;
  return [...label(game.winner), ` ${game.scores[side]}–${game.scores[1 - side]}${ot}`];
}
export function gameResultText(game: ExhibitionGame, label: (team: number) => string): string {
  const side = game.teams.indexOf(game.winner);
  const ot = game.ot === 0 ? '' : game.ot === 1 ? ' (OT)' : ` (${game.ot}OT)`;
  return `${label(game.winner)} ${game.scores[side]}–${game.scores[1 - side]}${ot}`;
}

/** Runs an event once (pre-rolled), saves it immediately, then reveals the saved result. */
function useEvent(props: StepProps) {
  const [pending, setPending] = useState<Extract<AllStarResult, { ok: true }> | null>(null);
  const [status, setStatus] = useState<'idle' | 'revealing' | 'failed'>('idle');

  const trySave = useCallback(async (r: Extract<AllStarResult, { ok: true }>) => {
    const ok = await props.save(r);
    if (ok) props.onRevealChange?.(true);
    setStatus(ok ? 'revealing' : 'failed');
  }, [props]);

  const run = (r: AllStarResult) => {
    if (!r.ok) { void props.save(r); return; }
    setPending(r);
    void trySave(r);
  };
  const retry = () => { if (pending) void trySave(pending); };
  const onFinished = useCallback(() => { setStatus('idle'); props.onRevealChange?.(false); }, [props]);
  return { pending, status, run, retry, onFinished };
}

export function ContestStep(props: StepProps & { contest: '5pt' | 'dunk' }) {
  const { doc, list, readOnly, saving, contest } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const label = contest === '5pt' ? '5pt contest' : 'dunk contest';
  const saved = contest === '5pt' ? doc.fivePoint : doc.dunk;
  if (ev.status === 'revealing' && ev.pending) {
    const r = contest === '5pt' ? ev.pending.doc.fivePoint! : ev.pending.doc.dunk!;
    return <StepCard title={label}><DiceReveal lines={contestLines(r, name)} onFinished={ev.onFinished} busy={saving} /></StepCard>;
  }
  if (saved) return <StepCard title={label}><StaticLines lines={contestLines(saved, name)} /></StepCard>;
  if (ev.status === 'failed') return <StepCard title={label}><button className="btn primary" disabled={saving} onClick={ev.retry}>Retry save</button></StepCard>;
  if (readOnly) return <StepCard title={label}><p className="muted">Not run yet.</p></StepCard>;
  return (
    <StepCard title={label}>
    <button className="btn primary" disabled={saving} onClick={() => ev.run(contest === '5pt' ? runFivePoint(doc, Math.random) : runDunk(doc, Math.random))}>
      Run the {label}
    </button>
    </StepCard>
  );
}

export function YsgDraftStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!doc?.selections) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  if (!doc.ysgDraft) {
    return readOnly ? null : <StepCard title="Young-Star draft"><button className="btn primary" disabled={saving} onClick={() => save(startYsgDraft(doc, Math.random))}>Start Young-Star draft</button></StepCard>;
  }
  const teams = ysgTeams(doc);
  const clock = ysgOnClock(doc);
  const available = ysgAvailable(doc, list);
  const chosen = available.find(p => p.playerId === selected);
  const captain = (t: number) => name(doc.selections!.youngCaptains[t]);
  const posOf = (id: string) => list.find(p => p.playerId === id)?.position;
  const counts = (ids: string[]) => POSITIONS.map(pos => `${pos} ${ids.filter(id => posOf(id) === pos).length}`).join(' · ');
  const picked = new Set(doc.ysgDraft.picks);
  const left = doc.selections.youngStars.filter(id => !picked.has(id));
  return (
    <div className="live-grid">
      <div className="grid-2">
        {teams.map((ids, t) => (
          <div key={t} className={`card headed asg-team${clock === t ? ' on-clock' : ''}`} style={ACCENT_SIDES[t % 2]}>
            <h3>Team <PlayerName id={doc.selections!.youngCaptains[t]} name={captain(t)} />{clock === t ? ' · on the clock' : ''}</h3>
            <p className="muted pos-counts" aria-label={`Team ${captain(t)} positions`}>{counts(ids)}</p>
            <ul>{ids.map(id => <li key={id}><PlayerName id={id} name={name(id)} /> · {posOf(id)}</li>)}</ul>
          </div>
        ))}
      </div>
      {clock !== null && !readOnly ? (
        <div className="card headed">
          <h3>Available · Team {captain(clock)}</h3>
          <p className="muted pos-counts" aria-label="Young-Stars left by position">Left to draft ({left.length}): {counts(left)}</p>
          <div className="table-wrap tall">
          <table className="stat-table market" aria-label="Available Young-Stars">
            <thead><tr><th>Player</th><th>Pos</th><th className="n">Rtg</th></tr></thead>
            <tbody>
              {available.map(p => (
                <tr key={p.playerId} className={p.playerId === selected ? 'selected' : undefined} onClick={() => setSelected(p.playerId)}>
                  <td><PlayerName id={p.playerId} name={p.name} /></td><td>{p.position}</td><td className="n">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {chosen && (
            <button className="btn primary" disabled={saving} onClick={async () => { if (await save(ysgPick(doc, chosen.playerId, list))) setSelected(null); }}>
              Pick {chosen.name} → Team {captain(clock)}
            </button>
          )}
        </div>
      ) : <p className="muted">The Young-Star draft is complete.</p>}
    </div>
  );
}

export function YsgStep(props: StepProps) {
  const { state, doc, list, readOnly, saving } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  const T = 'Young-Star tournament';
  if (ev.status === 'revealing' && ev.pending) return <StepCard title={T}><YsgTournament state={state} doc={ev.pending.doc} name={name} reveal onAllDone={ev.onFinished} /></StepCard>;
  if (doc.ysg) return <StepCard title={T}><YsgTournament state={state} doc={doc} name={name} reveal={false} onAllDone={ev.onFinished} /></StepCard>;
  if (ev.status === 'failed') return <StepCard title={T}><button className="btn primary" disabled={saving} onClick={ev.retry}>Retry save</button></StepCard>;
  if (readOnly) return <StepCard title={T}><p className="muted">Not played yet.</p></StepCard>;
  return <StepCard title={T}><button className="btn primary" disabled={saving} onClick={() => ev.run(runYoungStar(doc, list, Math.random))}>Run the Young-Star tournament</button></StepCard>;
}

export function AsgStep(props: StepProps) {
  const { state, doc, list, readOnly, saving } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  const T = 'All-Star Game';
  if (ev.status === 'revealing' && ev.pending) return <StepCard title={T}><AsgGame state={state} doc={ev.pending.doc} name={name} reveal onAllDone={ev.onFinished} /></StepCard>;
  if (doc.asg) return <StepCard title={T}><AsgGame state={state} doc={doc} name={name} reveal={false} onAllDone={ev.onFinished} /></StepCard>;
  if (ev.status === 'failed') return <StepCard title={T}><button className="btn primary" disabled={saving} onClick={ev.retry}>Retry save</button></StepCard>;
  if (readOnly) return <StepCard title={T}><p className="muted">Not played yet.</p></StepCard>;
  return <StepCard title={T}><button className="btn primary" disabled={saving} onClick={() => ev.run(runAsg(doc, list, Math.random))}>Play the All-Star Game</button></StepCard>;
}

export function WrapUp({ state, doc, list, saving, finished, onFinish }: StepProps & { finished: boolean; onFinish: () => void }) {
  if (!doc?.fivePoint || !doc.dunk || !doc.ysg || !doc.asg) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  const teams = asgTeams(doc);
  const g = doc.asg.game;
  return (
    <div className="card headed">
      <h3>All-Star weekend results</h3>
      <ul>
        <li>5pt contest: <PlayerName id={doc.fivePoint.winner} name={name(doc.fivePoint.winner)} /></li>
        <li>Dunk contest: <PlayerName id={doc.dunk.winner} name={name(doc.dunk.winner)} /></li>
        <li>Young-Star champions: Team <PlayerName id={doc.selections!.youngCaptains[doc.ysg.champion]} name={name(doc.selections!.youngCaptains[doc.ysg.champion])} />{doc.ysg.mvp && <> · MVP <PlayerName id={doc.ysg.mvp} name={name(doc.ysg.mvp)} /></>}</li>
        <li>All-Star Game: {line(name, '', gameResultParts(g, t => ['Team ', { id: teams[t][0] }])).node} · MVP <PlayerName id={doc.asg.mvp} name={name(doc.asg.mvp)} /></li>
      </ul>
      {finished ? <p className="muted">The All-Star weekend is finished.</p> : (
        <button className="btn primary" disabled={saving} onClick={onFinish}>Finish All-Star weekend</button>
      )}
    </div>
  );
}
