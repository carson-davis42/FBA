import type { Career, Honour, Stint } from '../../engine/history/career';
import type { AwardKey, FranchisesFile, Team } from '../../engine/shared/types';
import { AWARD_KEYS } from '../../engine/shared/types';
import { franchiseByAbbr } from '../../engine/shared/franchises';
import { TeamName } from '../components/TeamName';

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

/** The team lists a stint's team is looked up in, one per league. */
export interface StintTeams { fba: Team[]; d2: Team[]; college: Team[]; franchises?: FranchisesFile | null }

/** Spellings in the bios that differ from the school's name (and capitalisation is ignored). */
const COLLEGE_SPELLING: Record<string, string> = { lousiville: 'louisville' };
export const findSchool = (teams: Team[], name: string): Team | undefined => {
  const key = name.trim().toLowerCase();
  const want = COLLEGE_SPELLING[key] ?? key;
  return teams.find(t => t.name.toLowerCase() === want);
};

/** A stint's team as a link to its history page (franchise, D2 team or school) with its logo; text when the team is unknown or has no page. */
export function StintTeam({ stint, teams }: { stint: Stint; teams: StintTeams }) {
  const season = typeof stint.from === 'number' ? stint.from : typeof stint.to === 'number' ? stint.to : 1;
  if (stint.kind === 'fba') {
    return (
      <>
        {stint.team.split('/').map((code, i) => {
          // Bios use the abbreviation of the era (FP, CT, USA, CHA, SOX…), so the franchise is looked up by era first.
          const hit = franchiseByAbbr(teams.franchises, code, season);
          const t = teams.fba.find(x => x.teamId === (hit?.teamId ?? code));
          return <span key={i}>{i > 0 && '/'}{t ? <TeamName team={t} season={season} variant="abbr" size={18} abbr={code} name={hit?.era?.name ?? t.name} to={`/history/fba/teams/${t.teamId}`} /> : code}</span>;
        })}
      </>
    );
  }
  if (stint.kind === 'd2') {
    const name = /^D2\((.*)\)$/.exec(stint.team)?.[1] ?? stint.team;
    const t = teams.d2.find(x => x.name === name);
    return t ? <TeamName team={t} season={season} size={18} to={`/history/fbad2/teams/${t.teamId}`} /> : <>{name}</>;
  }
  if (stint.kind === 'college') {
    const t = findSchool(teams.college, stint.team);
    return t ? <TeamName team={t} season={season} size={18} to={`/history/fbajc/schools/${t.teamId}`} /> : <>{stint.team}</>;
  }
  return <>{stint.team.replace(/^WC\((.*)\)$/, '$1')}</>;
}

export function CareerSection({ career, born, totals, teams }: { career: Career; born: string | null; totals: Record<AwardKey, number>; teams: StintTeams }) {
  const pro = career.stints;
  const chips = AWARD_KEYS.filter(k => totals[k] > 0);
  return (
    <>
      {(born !== null || hasCareer(career)) && (
        <div>
          {born !== null && <p>Born: {born.replace(/^Born-/, '')}</p>}
          {hasCareer(career) && <h2>Career</h2>}
          {pro.length > 0 && (
            <div className="table-wrap">
              <table className="stat-table">
                <thead><tr><th>League</th><th>Team</th><th>Seasons</th><th>Honours</th></tr></thead>
                <tbody>
                  {pro.map((s, k) => (
                    <tr key={k}>
                      <td>{LEAGUE[s.kind]}</td>
                      <td><StintTeam stint={s} teams={teams} /></td>
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
