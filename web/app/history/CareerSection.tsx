import type { Career, Honour, Stint } from '../../engine/history/career';
import type { AwardKey } from '../../engine/shared/types';
import { AWARD_KEYS } from '../../engine/shared/types';

/** Short award names, shared by the Awards-by-player columns and the player page chips. */
export const AWARD_LABELS: Record<AwardKey, string> = {
  MVP: 'MVP', ROTY: 'ROTY', PPK: 'PPK', LP: 'LP', MC: 'MC', DPOY: 'DPOY', MIP: 'MIP',
  ALL_FBA_1: 'T1', ALL_FBA_2: 'T2', ALL_STAR: 'ASG', YOUNG_STAR: 'YSG',
  ASG_MVP: 'ASG MVP', YSG_MVP: 'YSG MVP', FINALS_MVP: 'Finals MVP', CHAMPION: 'Champion',
  CSHIP_APP: 'C-Ship app.', CONF_CHAMPION: 'Conf. Champion', FIVE_POINT: '5-pt', DUNK: 'Dunk',
};

const LEAGUE: Record<Stint['kind'], string> = { college: 'College', fba: 'FBA', d2: 'D2', wc: 'World Cup' };

function honourTexts(honours: Honour[]): string[] {
  const out: string[] = [];
  for (const h of honours) {
    if (h.seasons.length > 0) for (const n of h.seasons) out.push(`S${n} ${h.label}`);
    else out.push(`${h.count}x ${h.label}`);
  }
  return out;
}

export function hasCareer(career: Career): boolean {
  return career.stints.length > 0 || career.other.length > 0 || career.hof !== null;
}

export function CareerSection({ career, born, totals }: { career: Career; born: string | null; totals: Record<AwardKey, number> }) {
  const college = career.stints.filter(s => s.kind === 'college');
  const pro = career.stints.filter(s => s.kind !== 'college');
  const chips = AWARD_KEYS.filter(k => totals[k] > 0);
  return (
    <>
      {(born !== null || hasCareer(career)) && (
        <div>
          {born !== null && <p>Born: {born.replace(/^Born-/, '')}</p>}
          {hasCareer(career) && <h2>Career</h2>}
          {college.length > 0 && <p>College: {college.map(s => `${s.team} (${s.range})`).join(' · ')}</p>}
          {pro.length > 0 && (
            <div className="table-wrap">
              <table className="standings">
                <thead><tr><th>League</th><th>Team</th><th>Seasons</th><th>Honours</th></tr></thead>
                <tbody>
                  {pro.map((s, k) => (
                    <tr key={k}>
                      <td>{LEAGUE[s.kind]}</td>
                      <td>{s.team}</td>
                      <td>{s.range}</td>
                      <td>{honourTexts(s.honours).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {career.other.length > 0 && <ul className="muted">{career.other.map((e, k) => <li key={k}>{e}</li>)}</ul>}
          {career.hof !== null && <p>Hall of Fame: {career.hof}</p>}
        </div>
      )}
      {chips.length > 0 && (
        <div>
          <h2>Awards</h2>
          <ul className="chips">{chips.map(k => <li key={k} className="chip">{totals[k]}× {AWARD_LABELS[k]}</li>)}</ul>
        </div>
      )}
    </>
  );
}
