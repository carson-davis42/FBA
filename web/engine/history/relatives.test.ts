import { describe, expect, it } from 'vitest';
import { RelativesFile } from '../shared/types';
import { relativesOf } from './relatives';

const file = (parents: [string, string][], unlisted: string[] = []) =>
  RelativesFile.parse({ unlisted, parents: parents.map(([child, parent]) => ({ child, parent })) });
const labels = (f: ReturnType<typeof file>, id: string) => relativesOf(f, id).map(r => `${r.label}: ${r.playerId}`);

// The Quinsler family: Marcus (p1) has Matt (p2) and Saun (p3); Marcus's brother (u001, unlisted) has Stephen (p4);
// Stephen's grandchild Seth (p5) and Saun's grandchild CJ (p6) each come through an unlisted parent.
const quinsler = file([
  ['p00002', 'p00001'], ['p00003', 'p00001'],
  ['p00001', 'u001'], ['u002', 'u001'], ['p00004', 'u002'],
  ['u003', 'p00004'], ['p00005', 'u003'],
  ['u004', 'p00003'], ['p00006', 'u004'],
], ['u001', 'u002', 'u003', 'u004']);

describe('relativesOf', () => {
  it('names parents, children and siblings', () => {
    expect(labels(quinsler, 'p00001')).toContain('Child: p00002');
    expect(labels(quinsler, 'p00002')).toContain('Parent: p00001');
    expect(labels(quinsler, 'p00002')).toContain('Sibling: p00003');
  });

  it('derives uncles and nephews through an unlisted sibling', () => {
    expect(labels(quinsler, 'p00001')).toContain('Nephew/niece: p00004');
    expect(labels(quinsler, 'p00004')).toContain('Uncle/aunt: p00001');
  });

  it('derives cousins and grandchildren', () => {
    expect(labels(quinsler, 'p00002')).toContain('Cousin: p00004');
    expect(labels(quinsler, 'p00003')).toContain('Grandchild: p00006');
    expect(labels(quinsler, 'p00006')).toContain('Grandparent: p00003');
    expect(labels(quinsler, 'p00004')).toContain('Grandchild: p00005');
  });

  it('derives further removed relatives', () => {
    // Seth (p5) and CJ (p6): Stephen and Saun are first cousins, so their grandchildren are third cousins.
    expect(labels(quinsler, 'p00005')).toContain('Third cousin: p00006');
    // Matt (p2) to Stephen's child-of-a-cousin line: Seth is his first cousin twice removed.
    expect(labels(quinsler, 'p00002')).toContain('Cousin, twice removed: p00005');
    // Marcus's nephew Stephen has a grandchild Seth, so Seth is Marcus's great-grandnephew.
    expect(labels(quinsler, 'p00001')).toContain('Great-grandnephew/grandniece: p00005');
  });

  it('counts great-grandparents and great-uncles', () => {
    const f = file([['u001', 'p00001'], ['u002', 'u001'], ['p00002', 'u002'], ['p00001', 'u003'], ['p00003', 'u003'], ['u004', 'p00003'], ['p00004', 'u004']], ['u001', 'u002', 'u003', 'u004']);
    expect(labels(f, 'p00001')).toContain('Great-grandchild: p00002');
    expect(labels(f, 'p00002')).toContain('Great-grandparent: p00001');
    expect(labels(f, 'p00001')).toContain('Grandnephew/grandniece: p00004');
  });

  it('shows only listed players, closest first, and nothing for a player with no family', () => {
    expect(relativesOf(quinsler, 'p00001').every(r => r.playerId.startsWith('p'))).toBe(true);
    const order = relativesOf(quinsler, 'p00001').map(r => r.label);
    expect(order.indexOf('Child')).toBeLessThan(order.indexOf('Nephew/niece'));
    expect(relativesOf(quinsler, 'p09999')).toEqual([]);
  });
});

describe('RelativesFile', () => {
  it('rejects a cycle, a self-parent, a duplicate edge and an undeclared or unused unlisted id', () => {
    expect(RelativesFile.safeParse({ unlisted: [], parents: [{ child: 'p00001', parent: 'p00002' }, { child: 'p00002', parent: 'p00001' }] }).success).toBe(false);
    expect(RelativesFile.safeParse({ unlisted: [], parents: [{ child: 'p00001', parent: 'p00001' }] }).success).toBe(false);
    expect(RelativesFile.safeParse({ unlisted: [], parents: [{ child: 'p00001', parent: 'p00002' }, { child: 'p00001', parent: 'p00002' }] }).success).toBe(false);
    expect(RelativesFile.safeParse({ unlisted: [], parents: [{ child: 'p00001', parent: 'u001' }] }).success).toBe(false);
    expect(RelativesFile.safeParse({ unlisted: ['u001'], parents: [{ child: 'p00001', parent: 'p00002' }] }).success).toBe(false);
  });
  it('rejects three parents for one child', () => {
    expect(RelativesFile.safeParse({ unlisted: [], parents: ['p00002', 'p00003', 'p00004'].map(parent => ({ child: 'p00001', parent })) }).success).toBe(false);
  });
});
