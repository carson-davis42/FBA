import { useCallback, useState } from 'react';
import { asgTeams } from '../../engine/allstar/asgDraft';
import { runAsg } from '../../engine/allstar/asgGame';
import type { AllStarResult } from '../../engine/allstar/common';
import { runDunk, runFivePoint } from '../../engine/allstar/contests';
import { total } from '../../engine/allstar/dice';
import { runYoungStar, startYsgDraft, ysgAvailable, ysgOnClock, ysgPick, ysgTeams } from '../../engine/allstar/youngStars';
import type { ContestResult, TeamGame } from '../../engine/shared/types';
import { DiceReveal, type RevealLine, StaticLines } from './DiceReveal';
import type { StepProps } from './types';

export function contestLines(result: ContestResult, name: (id: string) => string): RevealLine[] {
  const out: RevealLine[] = [];
  result.rounds.forEach((round, r) => {
    const group = `Round ${r + 1}`;
    for (const id of round.players) {
      round.rolls[id].forEach((dice, k) => out.push({ group, text: `${name(id)} roll ${k + 1}: ${total(dice)}`, dice }));
    }
    for (const ro of round.rollOffs) for (const rnd of ro.rounds) for (const [id, dice] of Object.entries(rnd)) out.push({ group, text: `Roll-off: ${name(id)} ${total(dice)}`, dice });
    const standings = [...round.players].sort((a, b) => round.totals[b] - round.totals[a]).map(id => `${name(id)} ${round.totals[id]}`).join(', ');
    out.push({ group, text: `Totals: ${standings}` });
    out.push({ group, text: `Advancing: ${round.advanced.map(name).join(', ')}` });
  });
  out.push({ group: 'Result', text: `Winner: ${name(result.winner)}` });
  return out;
}

export function teamGameLines(game: TeamGame, label: (team: number) => string, name: (id: string) => string, period: (i: number) => string): RevealLine[] {
  const out: RevealLine[] = [];
  game.rolls.forEach((rolls, i) => {
    for (const r of rolls) {
      out.push({ group: period(i), text: `${label(r.team)} · ${name(r.playerId)}: ${total(r.dice)}`, dice: r.dice, side: game.teams.indexOf(r.team), value: total(r.dice) });
    }
  });
  if (game.rollOff) for (const rnd of game.rollOff.rounds) for (const [id, dice] of Object.entries(rnd)) out.push({ group: 'Roll-off', text: `${label(Number(id))}: ${total(dice)}`, dice });
  out.push({ group: 'Final', text: `Final: ${label(game.teams[0])} ${game.scores[0]} – ${label(game.teams[1])} ${game.scores[1]} · ${label(game.winner)} win` });
  return out;
}

/** Runs an event once (pre-rolled), reveals it, and saves when the reveal ends. */
function useEvent(props: StepProps) {
  const [pending, setPending] = useState<Extract<AllStarResult, { ok: true }> | null>(null);
  const start = (r: AllStarResult) => {
    if (r.ok) setPending(r);
    else void props.save(r);
  };
  const onFinished = useCallback(() => { if (pending) void props.save(pending); }, [pending, props]);
  return { pending, start, onFinished };
}

export function ContestStep(props: StepProps & { contest: '5pt' | 'dunk' }) {
  const { doc, list, readOnly, saving, contest } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const label = contest === '5pt' ? '5pt contest' : 'dunk contest';
  const saved = contest === '5pt' ? doc.fivePoint : doc.dunk;
  if (saved) return <StaticLines lines={contestLines(saved, name)} />;
  if (ev.pending) {
    const r = contest === '5pt' ? ev.pending.doc.fivePoint! : ev.pending.doc.dunk!;
    return <DiceReveal lines={contestLines(r, name)} onFinished={ev.onFinished} busy={saving} />;
  }
  if (readOnly) return <p className="muted">Not run yet.</p>;
  return (
    <button className="btn primary" disabled={saving} onClick={() => ev.start(contest === '5pt' ? runFivePoint(doc, Math.random) : runDunk(doc, Math.random))}>
      Run the {label}
    </button>
  );
}

export function YsgDraftStep({ state, doc, list, readOnly, saving, save }: StepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!doc?.selections) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  if (!doc.ysgDraft) {
    return readOnly ? null : <button className="btn primary" disabled={saving} onClick={() => save(startYsgDraft(doc, Math.random))}>Start Young-Star draft</button>;
  }
  const teams = ysgTeams(doc);
  const clock = ysgOnClock(doc);
  const available = ysgAvailable(doc, list);
  const chosen = available.find(p => p.playerId === selected);
  const captain = (t: number) => name(doc.selections!.youngCaptains[t]);
  return (
    <div className="live-grid">
      <div className="grid-2">
        {teams.map((ids, t) => (
          <div key={t} className="card">
            <h3>Team {captain(t)}{clock === t ? ' · on the clock' : ''}</h3>
            <ul>{ids.map(id => <li key={id}>{name(id)} · {list.find(p => p.playerId === id)?.position}</li>)}</ul>
          </div>
        ))}
      </div>
      {clock !== null && !readOnly ? (
        <div className="card">
          <h3>Available · Team {captain(clock)}</h3>
          <table className="market" aria-label="Available Young-Stars">
            <thead><tr><th>Player</th><th>Pos</th><th className="n">Rtg</th></tr></thead>
            <tbody>
              {available.map(p => (
                <tr key={p.playerId} className={p.playerId === selected ? 'selected' : undefined} onClick={() => setSelected(p.playerId)}>
                  <td>{p.name}</td><td>{p.position}</td><td className="n">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

function ysgLines(doc: NonNullable<StepProps['doc']>, name: (id: string) => string): RevealLine[] {
  const ysg = doc.ysg!;
  const label = (t: number) => `Team ${name(doc.selections!.youngCaptains[t])}`;
  const games: [string, TeamGame][] = [['Semifinal 1', ysg.semis[0]], ['Semifinal 2', ysg.semis[1]], ['Final', ysg.final]];
  return [
    ...games.flatMap(([title, g]) => teamGameLines(g, label, name, i => `${title} · round ${i + 1}`).map(l => ({ ...l, side: undefined, group: l.group === 'Final' || l.group === 'Roll-off' ? `${title} · ${l.group.toLowerCase()}` : l.group }))),
    { group: 'Champions', text: `Champions: ${label(ysg.champion)}` },
  ];
}

export function YsgStep(props: StepProps) {
  const { state, doc, list, readOnly, saving } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  if (doc.ysg) return <StaticLines lines={ysgLines(doc, name)} />;
  if (ev.pending) return <DiceReveal lines={ysgLines(ev.pending.doc, name)} onFinished={ev.onFinished} busy={saving} />;
  if (readOnly) return <p className="muted">Not played yet.</p>;
  return <button className="btn primary" disabled={saving} onClick={() => ev.start(runYoungStar(doc, Math.random))}>Run the Young-Star tournament</button>;
}

function asgLines(doc: NonNullable<StepProps['doc']>, name: (id: string) => string): RevealLine[] {
  const teams = asgTeams(doc);
  const label = (t: number) => `Team ${name(teams[t][0])}`;
  return [...teamGameLines(doc.asg!.game, label, name, i => `Q${i + 1}`), { group: 'MVP', text: `MVP: ${name(doc.asg!.mvp)}` }];
}

export function AsgStep(props: StepProps) {
  const { doc, list, readOnly, saving } = props;
  const ev = useEvent(props);
  if (!doc) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? id;
  const teams = asgTeams(doc);
  const sides = [`Team ${name(teams[0][0])}`, `Team ${name(teams[1][0])}`];
  if (doc.asg) return <StaticLines lines={asgLines(doc, name)} />;
  if (ev.pending) return <DiceReveal lines={asgLines(ev.pending.doc, name)} sides={sides} onFinished={ev.onFinished} busy={saving} />;
  if (readOnly) return <p className="muted">Not played yet.</p>;
  return <button className="btn primary" disabled={saving} onClick={() => ev.start(runAsg(doc, list, Math.random))}>Play the All-Star Game</button>;
}

export function WrapUp({ state, doc, list, saving, finished, onFinish }: StepProps & { finished: boolean; onFinish: () => void }) {
  if (!doc?.fivePoint || !doc.dunk || !doc.ysg || !doc.asg) return null;
  const name = (id: string) => list.find(p => p.playerId === id)?.name ?? state.players.players[id]?.name ?? id;
  const teams = asgTeams(doc);
  const g = doc.asg.game;
  return (
    <div className="card">
      <h3>All-Star weekend results</h3>
      <ul>
        <li>5pt contest: {name(doc.fivePoint.winner)}</li>
        <li>Dunk contest: {name(doc.dunk.winner)}</li>
        <li>Young-Star champions: Team {name(doc.selections!.youngCaptains[doc.ysg.champion])}</li>
        <li>All-Star Game: Team {name(teams[g.winner][0])} {g.scores[g.winner]}–{g.scores[1 - g.winner]} · MVP {name(doc.asg.mvp)}</li>
      </ul>
      {finished ? <p className="muted">The All-Star weekend is finished.</p> : (
        <button className="btn primary" disabled={saving} onClick={onFinish}>Finish All-Star weekend</button>
      )}
    </div>
  );
}
