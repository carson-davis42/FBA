// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TradeAssessment } from '../../engine/roster/tradeValue';
import { TradeFairness } from './TradeFairness';

afterEach(cleanup);
const names = (id: string) => `${id} Team`;
const side = (teamId: string, receives: number, gives: number) => ({ teamId, receives, gives, net: receives - gives });

describe('TradeFairness', () => {
  it('says fair when nobody is favoured, with the marker at the centre', () => {
    const a: TradeAssessment = { sides: [side('AAA', 40, 41), side('BBB', 41, 40)], moved: 81, favoured: null, imbalance: 0.01, verdict: 'fair' };
    const { container } = render(<TradeFairness assessment={a} nameOf={names} />);
    expect(screen.getByText('Fair trade')).toBeTruthy();
    expect(parseFloat((container.querySelector('.fairness-marker') as HTMLElement).style.left)).toBeCloseTo(50.6, 0);
  });

  it('tips toward the team that comes out ahead and lists what each side gets and gives', () => {
    const a: TradeAssessment = { sides: [side('AAA', 10, 60), side('BBB', 60, 10)], moved: 70, favoured: 'BBB', imbalance: 0.71, verdict: 'lopsided' };
    const { container } = render(<TradeFairness assessment={a} nameOf={names} />);
    expect(screen.getByText('Lopsided toward BBB Team')).toBeTruthy();
    expect(parseFloat((container.querySelector('.fairness-marker') as HTMLElement).style.left)).toBeGreaterThan(80);
    expect(screen.getByText(/AAA Team/, { selector: 'li b' })).toBeTruthy();
    expect(screen.getByText('(−50)')).toBeTruthy();
    expect(screen.getByText('(+50)')).toBeTruthy();
  });

  it('lists every team but draws no bar for a three-team trade', () => {
    const a: TradeAssessment = { sides: [side('AAA', 30, 20), side('BBB', 20, 30), side('CCC', 25, 25)], moved: 75, favoured: 'AAA', imbalance: 0.13, verdict: 'slight' };
    const { container } = render(<TradeFairness assessment={a} nameOf={names} />);
    expect(screen.getByText('Slightly favours AAA Team')).toBeTruthy();
    expect(container.querySelector('.fairness-bar')).toBeNull();
    expect(container.querySelectorAll('.fairness-sides li')).toHaveLength(3);
  });
});
