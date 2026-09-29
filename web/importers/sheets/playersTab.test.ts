import { describe, expect, it } from 'vitest';
import { closeMatches, editDistance, parsePlayersTab, sameName, type SheetPlayer } from './playersTab';

const sheet: SheetPlayer[] = [
  { name: 'Kellan Ogbu', born: 59 },
  { name: 'Saun Payton', born: null },
];

describe('parsePlayersTab', () => {
  it('reads name and born season, skipping blank names', () => {
    const rows = [['Kellan Ogbu', 'Born-S59', 'Houston-S77-pres.'], ['', '', ''], ['Saun Payton', 'Born-FFL S1(-53)']];
    const out = parsePlayersTab(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'Kellan Ogbu', born: 59 });
    expect(out[1]).toEqual({ name: 'Saun Payton', born: null });
  });
});

describe('name matching', () => {
  it('sameName ignores case, spacing and curly apostrophes', () => {
    expect(sameName(' Jamari O’Neal ', "jamari o'neal")).toBe(true);
    expect(sameName('A B', 'A C')).toBe(false);
  });

  it('editDistance is Levenshtein on the normalised names', () => {
    expect(editDistance('Kellen', 'kellan')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'SAME')).toBe(0);
  });

  it('closeMatches finds names within distance 2', () => {
    expect(closeMatches('Kellen Ogbu', sheet)).toEqual([{ name: 'Kellan Ogbu', born: 59 }]);
  });

  it('closeMatches skips names whose length differs by more than 2', () => {
    expect(closeMatches('Ann', [{ name: 'Anna', born: 1 }, { name: 'Annabelle Long', born: 2 }])).toEqual([{ name: 'Anna', born: 1 }]);
  });

  it('closeMatches returns nothing when the name is in the sheet, apostrophes aside', () => {
    expect(closeMatches("Jamari O'Neal", [{ name: 'Jamari O’Neal', born: null }])).toEqual([]);
  });
});
