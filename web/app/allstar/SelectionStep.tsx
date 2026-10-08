import { useEffect, useMemo, useRef, useState } from 'react';
import { saveSelections, selectionProblems, suggestSelections } from '../../engine/allstar/selection';
import { captainRules, drawChampionCaptains, eligibleCaptains, suggestYoungCaptains, type CaptainRules } from '../../engine/allstar/youngCaptains';
import { mulberry32 } from '../../engine/d2/random';
import { POSITIONS } from '../../engine/roster/rules';
import { playerSeasonStats } from '../../engine/season/ratingPause';
import type { AllStarSelections, HallOfFameFile } from '../../engine/shared/types';
import { docFailure, docSettled, useDoc, useHistory } from '../api';
import { motionAllowed } from './DiceReveal';
import { teamLabel } from '../season/GameViews';
import type { StepProps } from './types';
import { PlayerName } from '../components/PlayerName';

const newRng = () => mulberry32(Math.floor(Math.random() * 2 ** 32));
const SPIN_TICKS = 14;
const SPIN_MS = 90;
const labelOf = (state: StepProps['state'], id: string) => `${state.players.players[id]?.name ?? id} (${id})`;
const idFrom = (text: string) => /\((p\d{5})\)$/.exec(text.trim())?.[1] ?? '';

/** Loads the Hall of Fame and the past seasons (who may captain a Young-Star team), then shows the form. */
export function SelectionStep(props: StepProps) {
  const hof = useDoc<HallOfFameFile>('leagues/fba/hallOfFame.json');
  const { seasons, error } = useHistory('fba');
  const failure = error ?? docFailure(hof);
  if (failure) return <p className="error">Couldn't load the Young-Star captain rules: {failure.message}</p>;
  if (!seasons || !docSettled(hof)) return <p className="muted">Loading…</p>;
  return <SelectionForm {...props} rules={captainRules(hof.data, seasons, props.state.players)} />;
}

function SelectionForm({ state, doc, list, readOnly, saving, save, rules }: StepProps & { rules: CaptainRules }) {
  const ppg = useMemo(() => {
    const stats = playerSeasonStats(state.results);
    return new Map([...stats].map(([id, s]) => [id, s.games ? s.pts / s.games : 0]));
  }, [state.results]);
  const [sel, setSel] = useState<AllStarSelections>(() => doc?.selections ?? suggestSelections(list, ppg));
  const [ycText, setYcText] = useState<string[]>(() => {
    const saved = doc?.selections?.youngCaptains;
    const ids = saved?.length ? saved : suggestYoungCaptains(rules, sel.youngStars, newRng());
    const names = ids.map(id => labelOf(state, id));
    return [0, 1, 2, 3].map(i => names[i] ?? '');
  });
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(timer.current), []);
  const keptIds = ycText.map(idFrom).filter(id => rules.hofClass.includes(id));
  const openSlots = [0, 1, 2, 3].filter(i => !rules.hofClass.includes(idFrom(ycText[i])));
  const spinPool = rules.champions.filter(id => !keptIds.includes(id) && !sel.youngStars.includes(id));
  /** Cycles the open captain spots through past champion captains, then lands on a random draw (different captains in each). */
  const drawChampions = () => {
    const landed = drawChampionCaptains(rules, sel.youngStars, keptIds, openSlots.length, newRng());
    const spinsNow = motionAllowed();
    const show = (ids: (string | undefined)[]) => setYcText(t => t.map((x, i) => {
      const k = openSlots.indexOf(i);
      return k < 0 ? x : ids[k] ? labelOf(state, ids[k]!) : '';
    }));
    if (!spinsNow) { show(landed); return; }
    const flick = newRng();
    let ticks = 0;
    setSpinning(true);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      ticks += 1;
      if (ticks >= SPIN_TICKS) { clearInterval(timer.current); show(landed); setSpinning(false); return; }
      show(openSlots.map(() => spinPool[Math.floor(flick() * spinPool.length)]));
    }, SPIN_MS);
  };
  const current: AllStarSelections = { ...sel, youngCaptains: ycText.map(idFrom).filter(Boolean) };
  const problems = selectionProblems(current, list, state.players, rules);
  const byId = new Map(list.map(p => [p.playerId, p]));
  const counts = (ids: string[]) => POSITIONS.map(p => `${p} ${ids.filter(id => byId.get(id)?.position === p).length}`).join(' · ');
  const best = [...list].sort((a, b) => b.rating - a.rating || (ppg.get(b.playerId) ?? 0) - (ppg.get(a.playerId) ?? 0) || a.name.localeCompare(b.name));
  const youngFirst = [...best.filter(p => p.restricted), ...best.filter(p => !p.restricted)];
  const captainPool = eligibleCaptains(rules, sel.youngStars).flatMap(id => state.players.players[id] ?? []);

  const toggle = (key: 'allStars' | 'youngStars', id: string) => setSel(s => {
    const has = s[key].includes(id);
    const next = { ...s, [key]: has ? s[key].filter(x => x !== id) : [...s[key], id] };
    return key === 'allStars' && has ? { ...next, captains: s.captains.filter(c => c !== id) } : next;
  });
  const setCaptain = (i: number, id: string) => setSel(s => {
    const c = [s.captains[0] ?? '', s.captains[1] ?? ''];
    c[i] = id;
    return { ...s, captains: c.filter(Boolean) };
  });

  const table = (label: string, key: 'allStars' | 'youngStars', rows: typeof list) => (
    <div className="table-wrap tall" style={{ maxHeight: 320 }}>
      <table className="stat-table pick-table" aria-label={label}>
        <thead><tr><th></th><th>Player</th><th>Pos</th><th>Team</th><th className="n">Rtg</th><th className="n">PPG</th></tr></thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.playerId}>
              <td><input type="checkbox" aria-label={`${label}: ${p.name}`} checked={sel[key].includes(p.playerId)} disabled={readOnly} onChange={() => toggle(key, p.playerId)} /></td>
              <td><PlayerName id={p.playerId} name={p.name} />{p.restricted && key === 'youngStars' ? ' · rookie deal' : ''}</td><td>{p.position}</td><td>{teamLabel(state, p.teamId)}</td>
              <td className="n">{p.rating}</td><td className="n">{(ppg.get(p.playerId) ?? 0).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="stack">
      <div className="card headed">
        <h3>All-Stars · {sel.allStars.length}/28 · {counts(sel.allStars)} (4–11 per position)</h3>
        {[0, 1].map(i => (
          <label key={i}>ASG captain {i + 1}{' '}
            <select value={sel.captains[i] ?? ''} disabled={readOnly} onChange={e => setCaptain(i, e.target.value)}>
              <option value="">—</option>
              {sel.allStars.map(id => <option key={id} value={id}>{byId.get(id)?.name ?? id}</option>)}
            </select>
          </label>
        ))}
        {table('All-Stars', 'allStars', best)}
      </div>
      <div className="card headed">
        <h3>Young-Stars · {sel.youngStars.length}/20 · {counts(sel.youngStars)} (2–7 per position)</h3>
        {table('Young-Stars', 'youngStars', youngFirst)}
        <datalist id="captain-players">
          {captainPool.map(p => <option key={p.id} value={`${p.name} (${p.id})`} />)}
        </datalist>
        <p className="muted">Young-Star captains: the latest Hall of Fame class, then former Young-Star champion captains drawn at random.</p>
        {!readOnly && openSlots.length > 0 && (
          <button className="btn" disabled={spinning || spinPool.length === 0} onClick={drawChampions}>
            {spinning ? 'Drawing…' : `Draw ${openSlots.length > 1 ? 'champion captains' : 'a champion captain'}`}
          </button>
        )}
        {[0, 1, 2, 3].map(i => (
          <label key={i}>Young-Star captain {i + 1}{' '}
            <input list="captain-players" aria-label={`Young-Star captain ${i + 1}`} value={ycText[i]} disabled={readOnly || spinning}
              onChange={e => setYcText(t => t.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      {!readOnly && problems.length > 0 && <ul className="problems">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {!readOnly && (
        <button className="btn primary" disabled={saving || spinning || problems.length > 0} onClick={() => save(saveSelections(doc, current, state.season, list, state.players, rules))}>
          Save selections
        </button>
      )}
    </div>
  );
}
