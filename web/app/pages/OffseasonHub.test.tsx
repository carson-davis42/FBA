// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OffseasonHub } from './OffseasonHub';

const calendar = { season: 79, steps: [
  { id: 'adjust-age', label: 'Adjust Age', kind: 'offseason', league: null, sub: true, done: true },
  { id: 'retirement', label: 'Retirement', kind: 'offseason', league: null, sub: true, done: false },
  { id: 'fba', label: 'FBA', kind: 'league', league: 'fba', sub: false, done: false },
] };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.replace('/api/state/', '') === 'calendar.json' ? new Response(JSON.stringify(calendar)) : new Response('{}', { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('OffseasonHub', () => {
  it('renders a tile per tool and marks the current step', async () => {
    render(<MemoryRouter><OffseasonHub /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Offseason tools', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Free agency/ }).getAttribute('href')).toBe('/league/fba/free-agency');
    expect(screen.getByRole('link', { name: /D2 draft/ }).getAttribute('href')).toBe('/league/fbad2/draft');
    expect(screen.getByRole('link', { name: /Class ranking/ }).getAttribute('href')).toBe('/league/fbajc/class-ranking');
    const retirement = screen.getByRole('link', { name: /Retirement/ });
    expect(within(retirement).getByText('Current')).toBeTruthy();
    expect(screen.getAllByText('Current')).toHaveLength(1);
  });
});
