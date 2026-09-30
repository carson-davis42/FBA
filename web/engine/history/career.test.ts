import { describe, it, expect } from 'vitest';
import { parseBio, bioAwardKey, careerAwardSums } from './career';

describe('parseBio', () => {
  it('parses Akeem Naylor', () => {
    const c = parseBio({
      born: 'Born-S45',
      entries: ['Wake Forest-S63', 'S63 FOY', '1x All-American', '1x POY', '1x JP Award', '1x AAC POY', '1x AAC RS Champion', '1x AAC TOUR Champion',
        'CIN-S64-S69', '6x All-Star', '2x Young-Star', '3x All-FBA T1', '1x MVP', '1x LP Award', '2x ASG MVP',
        'MON-S70-S73', '4x All-FBA T1', '4x All-Star', '3x LP Award', '1x FBA C-Ship app.', '1x FBA Champion', '1x FBA C-Ship MVP', '1x ASG MVP',
        'OAK-S74-S77', '4x All-Star', '1x LP Award', '2x All-FBA T1', '2x WC Champion', '2x FBA C-Ship app.', '1x FBA Champion', '1x All-FBA T2', 'HOF-S77'],
    });
    expect(c.stints.filter(s => s.kind === 'college')).toHaveLength(1);
    expect(c.stints.filter(s => s.kind === 'fba')).toHaveLength(3);
    expect(c.hof).toBe('S77');
    expect(c.other).toEqual([]);
    expect(c.stints[0]).toMatchObject({ team: 'Wake Forest', range: 'S63', from: 63, to: 63 });
    expect(c.stints[0].honours[0]).toEqual({ label: 'FOY', count: 1, seasons: [63] });
    expect(c.stints[1]).toMatchObject({ team: 'CIN', range: 'S64-S69', from: 64, to: 69 });
    expect(careerAwardSums(c)).toEqual({
      ALL_STAR: 14, ALL_FBA_1: 9, LP: 5, ASG_MVP: 3, CHAMPION: 2, FINALS_MVP: 1, CONF_CHAMPION: 2, MVP: 1,
      YOUNG_STAR: 2, CSHIP_APP: 3, ALL_FBA_2: 1,
    });
  });

  it('parses Payton Atkinson', () => {
    const c = parseBio({
      born: 'Born-S46',
      entries: ['Alabama-S64', '1x NC app.', '1x All-American', '1x DH Award', '1x SEC RS Champion', '1x SEC TOUR Champion',
        'FLO-S65-S76', '12x All-Star', '2x Young-Star', '6x FBA C-Ship app.', '2x FBA Champion', '4x WC Champion', '1x MC Award', '1x All-FBA T1', '5x All-FBA T2',
        'NO-S77-S78', '2x All-Star', 'HOF-S78'],
    });
    expect(c.stints.map(s => s.kind)).toEqual(['college', 'fba', 'fba']);
    expect(c.hof).toBe('S78');
    const sums = careerAwardSums(c);
    expect(sums.ALL_STAR).toBe(14);
    expect(sums.CONF_CHAMPION).toBe(4);
    expect(sums.MC).toBe(1);
    expect(sums.ALL_FBA_2).toBe(5);
    expect(sums.CSHIP_APP).toBe(6);
  });

  it('parses Julien Shannon with a present stint', () => {
    const c = parseBio({ born: 'Born-S50', entries: ['New Mexico State-S66', '1x PAT POY', 'Creighton-S67', '1x BE POY', 'CP-S68-pres.', '2x Young-Star', '10x All-Star', '2x MVP'] });
    expect(c.stints.map(s => s.kind)).toEqual(['college', 'college', 'fba']);
    expect(c.stints[2]).toMatchObject({ team: 'CP', from: 68, to: 'pres', range: 'S68-pres.' });
    expect(careerAwardSums(c)).toEqual({ YOUNG_STAR: 2, ALL_STAR: 10, MVP: 2 });
  });

  it('parses single-season honours (Cameron Lučić)', () => {
    const c = parseBio({ born: 'Born-S51', entries: ['North Carolina-S69', 'DET-S70-pres.', '7x All-Star', 'S75 MIP'] });
    expect(c.stints[1].honours).toEqual([
      { label: 'All-Star', count: 7, seasons: [] },
      { label: 'MIP', count: 1, seasons: [75] },
    ]);
    expect(careerAwardSums(c)).toEqual({ ALL_STAR: 7, MIP: 1 });
  });

  it('merges equal single-season labels in one stint', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['CIN-S64-S69', 'S65 MIP', 'S67 mip'] });
    expect(c.stints[0].honours).toEqual([{ label: 'MIP', count: 2, seasons: [65, 67] }]);
  });

  it('handles edge-case stints', () => {
    const ffl = parseBio({ born: 'Born-FFL', entries: ['SOX - FFL-FFL'] }).stints[0];
    expect(ffl).toMatchObject({ kind: 'fba', team: 'SOX', from: null, to: null, range: 'FFL-FFL' });
    const wc = parseBio({ born: 'Born-S1', entries: ['WC(Germany)-S56-S58;S62'] }).stints[0];
    expect(wc).toMatchObject({ kind: 'wc', team: 'WC(Germany)', from: 56, to: 62, range: 'S56-S58;S62' });
    expect(parseBio({ born: 'Born-S1', entries: ['D2(Milan)-S53-S56'] }).stints[0].kind).toBe('d2');
    expect(parseBio({ born: 'Born-S1', entries: ['FP/MON-S6-S25'] }).stints[0].kind).toBe('fba');
    expect(parseBio({ born: 'Born-S1', entries: ['?-S19-S34'] }).stints[0].kind).toBe('fba');
  });

  it('keeps unmatched entries and orphan honours under other', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['2x All-Star', 'Some note', 'CIN-S1-S2'] });
    expect(c.other).toEqual(['2x All-Star', 'Some note']);
    expect(c.stints).toHaveLength(1);
    expect(c.hof).toBeNull();
  });

  it('only counts FBA stints in the sums', () => {
    const c = parseBio({ born: 'Born-S1', entries: ['D2(Milan)-S53-S56', '3x All-Star', 'WC(Peru)-S57', '1x MVP', 'Wake Forest-S60', '1x MVP'] });
    expect(careerAwardSums(c)).toEqual({});
  });
});

describe('bioAwardKey', () => {
  it('maps labels case-insensitively', () => {
    expect(bioAwardKey('MVP')).toBe('MVP');
    expect(bioAwardKey('  fba champion ')).toBe('CHAMPION');
    expect(bioAwardKey('FBA C-Ship MVP')).toBe('FINALS_MVP');
    expect(bioAwardKey('ec champion')).toBe('CONF_CHAMPION');
    expect(bioAwardKey('WC Champion')).toBe('CONF_CHAMPION');
    expect(bioAwardKey('PPK Award')).toBe('PPK');
    expect(bioAwardKey('All-American')).toBeNull();
    expect(bioAwardKey('FIVE_POINT')).toBeNull();
  });
});
