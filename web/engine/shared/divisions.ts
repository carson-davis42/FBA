/** The first season the FBA plays in divisions (84-game schedule, division playoff bracket). */
export const DIVISIONS_SEASON = 80;

export interface DivisionDef { division: string; group: 'E' | 'W'; name: string; teams: string[] }

/** Two divisions of eight in each conference. Boise's team id is LAL. */
export const DIVISION_LAYOUT: DivisionDef[] = [
  { division: 'AT', group: 'E', name: 'Atlantic', teams: ['BOS', 'MW', 'NY', 'MAN', 'PHI', 'DCB', 'CAR', 'MON'] },
  { division: 'GL', group: 'E', name: 'Great Lakes', teams: ['CHI', 'MIL', 'DET', 'CIN', 'CP', 'OV', 'TOR', 'STL'] },
  { division: 'PA', group: 'W', name: 'Pacific', teams: ['SEA', 'VAN', 'LAL', 'OAK', 'LA', 'VEG', 'HON', 'DEN'] },
  { division: 'GU', group: 'W', name: 'Gulf', teams: ['TEX', 'SAS', 'NO', 'FLO', 'CGG', 'PHX', 'MEM', 'ATL'] },
];

export function divisionName(code: string | null | undefined): string {
  return DIVISION_LAYOUT.find(d => d.division === code)?.name ?? '';
}
