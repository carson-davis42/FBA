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
});
