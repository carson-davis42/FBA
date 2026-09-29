// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LeagueTabs } from './LeagueTabs';

afterEach(cleanup);

describe('LeagueTabs', () => {
  it('lists the FBA tabs in order', () => {
    render(<MemoryRouter><LeagueTabs league="fba" /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(a => a.textContent)).toEqual(['Scores', 'Standings', 'Playoffs', 'Awards', 'Rankings', 'Teams', 'Transactions']);
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/league/fba/scores', '/league/fba/standings', '/league/fba/playoffs', '/league/fba/awards', '/league/fba/rankings', '/league/fba', '/league/fba/transactions',
    ]);
  });

  it('scrolls the active tab into view (phone width)', () => {
    const seen: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { seen.push(this); };
    try {
      render(<MemoryRouter initialEntries={['/league/fba/rankings']}><LeagueTabs league="fba" /></MemoryRouter>);
      expect(seen.map(e => e.textContent)).toEqual(['Rankings']);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('gives the FBAJC Teams and Recruiting, and the World Cup only Teams', () => {
    render(<MemoryRouter><LeagueTabs league="fbajc" /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(a => [a.textContent, a.getAttribute('href')])).toEqual([['Teams', '/league/fbajc'], ['Recruiting', '/league/fbajc/recruiting']]);
    cleanup();
    render(<MemoryRouter><LeagueTabs league="fbawc" /></MemoryRouter>);
    expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(['Teams']);
  });
});
