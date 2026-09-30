import { describe, expect, it } from 'vitest';
import { franchiseAt, franchiseByAbbr, resolveHistoryTeam } from './franchises';
import { FranchisesFile, type Team } from './types';

const file: FranchisesFile = {
  franchises: [
    { teamId: 'MON', eras: [
      { name: 'Montreal Chevaliers', abbr: 'MON', city: 'Montreal, Quebec, Canada', from: 57, to: null },
      { name: 'Montreal', abbr: 'MON', city: 'Montreal, Quebec, Canada', from: 12, to: 56 },
      { name: 'Texas Outlaws', abbr: 'TEX', city: 'Dallas, Texas', from: 1, to: 10 },
    ] },
    { teamId: 'TEX', eras: [{ name: 'Texas Outlaws', abbr: 'TEX', city: 'Dallas, Texas', from: 41, to: null }] },
    { teamId: 'DEN', eras: [{ name: 'Denver Heights', abbr: 'DEN', city: 'Denver, Colorado', from: 61, to: null }] },
    { teamId: 'CHI', eras: [
      { name: 'Chicago Spartans', abbr: 'CHI', city: 'Chicago, Illinois', from: 49, to: null },
      { name: 'Chicago Spartans', abbr: 'CHI', city: 'Chicago, Illinois', from: 45, to: 49 },
    ] },
    { teamId: 'CP', eras: [{ name: 'Former Pirates', abbr: 'FP', city: 'Columbus, Ohio', from: 1, to: 56 }] },
  ],
};

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('MON', 'Montreal Chevaliers', 'MON'), team('TEX', 'Texas Outlaws', 'TEX'), team('DEN', 'Denver Heights', 'DEN'), team('CP', 'Columbus Pirates', 'CP')];

describe('franchiseAt', () => {
  it('resolves a reused name by season', () => {
    expect(franchiseAt(file, 'Texas Outlaws', 10)?.teamId).toBe('MON');
    expect(franchiseAt(file, 'Texas Outlaws', 50)?.teamId).toBe('TEX');
  });
  it('resolves an old name to its franchise', () => {
    expect(franchiseAt(file, 'Montreal', 30)).toEqual({ teamId: 'MON', era: file.franchises[0].eras[1] });
  });
  it('maps the Denver Height typo', () => {
    expect(franchiseAt(file, 'Denver Height', 74)?.teamId).toBe('DEN');
  });
  it('uses the nearest era with that name in a gap', () => {
    expect(franchiseAt(file, 'Montreal', 11)?.era.from).toBe(12);
  });
  it('prefers the later-starting era when two cover the season', () => {
    expect(franchiseAt(file, 'Chicago Spartans', 49)?.era.from).toBe(49);
  });
  it('returns null for an unknown name or no file', () => {
    expect(franchiseAt(file, 'Nobody', 30)).toBeNull();
    expect(franchiseAt(null, 'Montreal', 30)).toBeNull();
  });
});

describe('resolveHistoryTeam', () => {
  it('gives the current team with the era name and abbreviation', () => {
    const hit = resolveHistoryTeam(teams, file, 'Former Pirates', 20);
    expect(hit?.team.teamId).toBe('CP');
    expect(hit?.name).toBe('Former Pirates');
    expect(hit?.abbr).toBe('FP');
  });
  it('shows the corrected name for a typo', () => {
    expect(resolveHistoryTeam(teams, file, 'Denver Height', 74)?.name).toBe('Denver Heights');
  });
  it('lets a stored teamId win over the name lookup', () => {
    const hit = resolveHistoryTeam(teams, file, 'Texas Outlaws', 10, 'TEX');
    expect(hit?.team.teamId).toBe('TEX');
    expect(hit?.name).toBe('Texas Outlaws');
    expect(hit?.abbr).toBe('TEX');
  });
  it('falls back to an exact current-name match without a file', () => {
    expect(resolveHistoryTeam(teams, null, 'Montreal', 30)).toBeNull();
    expect(resolveHistoryTeam(teams, null, 'Texas Outlaws', 50)?.team.teamId).toBe('TEX');
  });
});

describe('FranchisesFile schema', () => {
  it('rejects an era that ends before it starts', () => {
    const bad = { franchises: [{ teamId: 'X', eras: [{ name: 'X', abbr: 'X', city: 'Y', from: 10, to: 5 }] }] };
    expect(FranchisesFile.safeParse(bad).success).toBe(false);
    expect(FranchisesFile.safeParse(file).success).toBe(true);
  });
});

describe('franchiseByAbbr', () => {
  const file: FranchisesFile = { franchises: [
    { teamId: 'SAS', eras: [
      { name: 'San Antonio Spirits', abbr: 'SAS', city: 'San Antonio, Texas', from: 57, to: null },
      { name: 'San Antonio', abbr: 'USA', city: 'San Antonio, Texas', from: 1, to: 56 },
    ] },
    { teamId: 'CAR', eras: [{ name: 'Cal Tech Knights', abbr: 'CT', city: 'x', from: 41, to: 67 }] },
  ] };
  it('maps an era abbreviation to the franchise in that season', () => {
    expect(franchiseByAbbr(file, 'USA', 20)?.teamId).toBe('SAS');
    expect(franchiseByAbbr(file, 'CT', 60)?.teamId).toBe('CAR');
  });
  it('uses the nearest era outside its range, then a current team id', () => {
    expect(franchiseByAbbr(file, 'CT', 70)?.teamId).toBe('CAR');
    expect(franchiseByAbbr({ franchises: [{ teamId: 'MW', eras: [{ name: 'Maine Wildcats', abbr: 'MNE', city: 'x', from: 1, to: null }] }] }, 'MW', 5)).toEqual({ teamId: 'MW', era: null });
  });
  it('gives null for an unknown code or no file', () => {
    expect(franchiseByAbbr(file, 'ZZZ', 5)).toBeNull();
    expect(franchiseByAbbr(null, 'USA', 5)).toBeNull();
  });
});
