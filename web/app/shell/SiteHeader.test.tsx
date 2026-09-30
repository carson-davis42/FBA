// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leagueFromPath } from './useCurrentLeague';
import { SiteHeader } from './SiteHeader';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/undo') return new Response(JSON.stringify({ ok: true, available: false, label: null }));
    return new Response(JSON.stringify({ season: 79, steps: [] }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* ignore */ } });

describe('leagueFromPath', () => {
  it('reads league routes, trade routes and history', () => {
    expect(leagueFromPath('/league/fbad2/scores')).toBe('fbad2');
    expect(leagueFromPath('/trade/fba')).toBe('fba');
    expect(leagueFromPath('/history/fba/players')).toBe('fba');
    expect(leagueFromPath('/calendar')).toBeNull();
    expect(leagueFromPath('/league/nope')).toBeNull();
  });
});

describe('SiteHeader', () => {
  it('shows the current league sections from the URL, then the global links', () => {
    render(<MemoryRouter initialEntries={['/league/fbad2/standings']}><SiteHeader /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Site sections' });
    const links = Array.from(nav.querySelectorAll('a')).map(a => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Scores', '/league/fbad2/scores'], ['Standings', '/league/fbad2/standings'], ['Playoffs', '/league/fbad2/playoffs'],
      ['Awards', '/league/fbad2/awards'], ['Rankings', '/league/fbad2/rankings'], ['Teams', '/league/fbad2'], ['Transactions', '/league/fbad2/transactions'],
      ['Calendar', '/calendar'], ['Offseason', '/offseason'], ['History', '/history'], ['Hall of Fame', '/history/fba/hall-of-fame'],
    ]);
    expect(screen.getByRole('link', { name: 'Standings' }).className).toContain('active');
    expect(screen.getByRole('link', { name: 'D2' }).className).toContain('active');
  });

  it('lists only Teams for the WC and Teams/Recruiting for the JC, with league hrefs', () => {
    const hrefs = () => Array.from(screen.getByRole('navigation', { name: 'Site sections' }).querySelectorAll('a')).map(a => a.getAttribute('href')).slice(0, -4);
    const wc = render(<MemoryRouter initialEntries={['/league/fbawc']}><SiteHeader /></MemoryRouter>);
    expect(hrefs()).toEqual(['/league/fbawc']);
    wc.unmount();
    render(<MemoryRouter initialEntries={['/league/fbajc/recruiting']}><SiteHeader /></MemoryRouter>);
    expect(hrefs()).toEqual(['/league/fbajc', '/league/fbajc/recruiting']);
  });

  it('scrolls the active link into view and keeps Teams active on team pages', () => {
    const spy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      render(<MemoryRouter initialEntries={['/league/fba/team/5']}><SiteHeader /></MemoryRouter>);
    } finally { Element.prototype.scrollIntoView = orig; }
    expect(screen.getByRole('link', { name: 'Teams' }).className).toContain('active');
    expect(spy).toHaveBeenCalled();
  });

  it('names the brand link for phone widths', () => {
    render(<MemoryRouter initialEntries={['/']}><SiteHeader /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'FBA Universe home' })).toBeTruthy();
  });

  it('remembers the last league on pages without one', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/league/fbajc']}><SiteHeader /></MemoryRouter>);
    unmount();
    render(<MemoryRouter initialEntries={['/calendar']}><SiteHeader /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Site sections' });
    expect(Array.from(nav.querySelectorAll('a')).slice(0, 2).map(a => a.textContent)).toEqual(['Teams', 'Recruiting']);
  });

  it('defaults to the FBA', () => {
    render(<MemoryRouter initialEntries={['/']}><SiteHeader /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'FBA' }).className).toContain('active');
  });
});
