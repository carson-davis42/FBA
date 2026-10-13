// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Champion, D2DraftHistoryFile, DraftHistoryFile, PlayersFile, SummaryFile, TeamsFile } from '../../engine/shared/types';
import { D2DraftSeasonPage } from './d2/D2DraftSeasonPage';
import { D2SeasonPage } from './d2/D2SeasonPage';
import { DraftSeasonPage } from './DraftSeasonPage';
import { JcSeasonPage } from './jc/JcSeasonPage';
import { SeasonHistoryPage } from './SeasonHistoryPage';
import { WcSeasonPage } from './wc/WcSeasonPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const DAY = 'Oct 12, 2026';
const SPAN = 'Oct 1 – Oct 12, 2026';
const ANY_DAY = /[A-Z][a-z]{2} \d{1,2}, \d{4}/;
const SPAN_IN = { opened: '2026-10-01T12:00:00.000Z', locked: '2026-10-12T15:00:00.000Z' };

const players: PlayersFile = { nextId: 2, players: { p00001: { id: 'p00001', name: 'Ray Allen', birthSeason: 40 } } };
const team = (teamId: string, name: string, group: string | null = null) => ({ teamId, name, abbr: teamId, group, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });

function stub(league: 'fba' | 'fbad2' | 'fbajc' | 'fbawc', summary: SummaryFile | null, extra: Record<string, unknown> = {}) {
  const teams = { league, teams: [team('AAA', 'Alpha'), team('BBB', 'Beta')] } as TeamsFile;
  const docs: Record<string, unknown> = {
    '/api/state/players.json': players,
    '/api/state/leagues/fbad2/teams.json': { league: 'fbad2', teams: [team('AAA', 'Alpha')] },
    [`/api/state/leagues/${league}/teams.json`]: teams,
    ...extra,
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/history/')) return new Response(JSON.stringify({ seasons: summary ? [summary] : [], errors: [] }));
    if (url in docs) return new Response(JSON.stringify(docs[url]), { headers: { ETag: '"0000000000000001"' } });
    return new Response('{}', { status: 404 });
  }));
}
const at = (path: string, route: string, el: ReactElement) => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>,
);
const text = () => document.body.textContent ?? '';

const champ = (title: string, extra: Partial<Champion> = {}): Champion => ({ title, champion: 'Alpha', runnerUp: 'Beta', score: '4-2', teamId: 'AAA', runnerUpId: 'BBB', ...extra });
const summary = (league: SummaryFile['league'], season: number, champions: Champion[], extra: Partial<SummaryFile> = {}): SummaryFile =>
  ({ league, season, locked: true, host: null, champions, ...extra });

describe('FBA season page', () => {
  const page = async (s: SummaryFile) => {
    stub('fba', s);
    at('/history/fba/season/72', '/history/fba/season/:season', <SeasonHistoryPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Playoffs' }));
  };

  it('shows the Finals date', async () => {
    await page(summary('fba', 72, [champ('FBA Champion', { date: '2026-10-12' })]));
    expect(await screen.findByText(`Finals: ${DAY}`)).toBeTruthy();
    expect(text()).not.toContain('Season ran');
  });
  it('lists the dated events of the season: one day, a range, and nothing without a date', async () => {
    await page(summary('fba', 72, [champ('FBA Champion')], {
      events: [
        { label: 'FBA draft', start: null, end: '2026-05-29' },
        { label: 'Regular season', start: '2026-10-01', end: '2026-10-12' },
        { label: 'Unknown event', start: null, end: null },
      ],
    }));
    const list = await screen.findByRole('list', { name: 'Dated events' });
    expect(list.textContent).toContain('FBA draft · May 29, 2026');
    expect(list.textContent).toContain('Regular season · Oct 1 – Oct 12, 2026');
    expect(list.textContent).not.toContain('Unknown event');
  });
  it('shows no events list without events', async () => {
    await page(summary('fba', 72, [champ('FBA Champion')]));
    await screen.findByRole('tab', { name: 'Playoffs' });
    expect(screen.queryByRole('list', { name: 'Dated events' })).toBeNull();
  });
  it('shows the span of an app season', async () => {
    await page(summary('fba', 72, [champ('FBA Champion')], { span: SPAN_IN }));
    expect(await screen.findByText(`Season ran ${SPAN}`)).toBeTruthy();
    expect(text()).not.toContain('Finals:');
  });
  it('shows nothing without a date or span', async () => {
    await page(summary('fba', 72, [champ('FBA Champion', { date: null })]));
    await screen.findByText(/recorded/);
    expect(text()).not.toMatch(ANY_DAY);
    expect(text()).not.toContain('Season ran');
  });
});

describe('D2 season page', () => {
  const page = (s: SummaryFile) => {
    stub('fbad2', s);
    at('/history/fbad2/season/70', '/history/fbad2/season/:season', <D2SeasonPage />);
  };
  it('shows the date of each title', async () => {
    page(summary('fbad2', 70, [champ('Premier League Champion', { group: 'PL', date: '2026-10-12' })]));
    expect(await screen.findByText(new RegExp(DAY))).toBeTruthy();
  });
  it('shows the span', async () => {
    page(summary('fbad2', 70, [champ('Premier League Champion', { group: 'PL' })], { span: SPAN_IN }));
    expect(await screen.findByText(`Season ran ${SPAN}`)).toBeTruthy();
  });
  it('shows nothing without a date or span', async () => {
    page(summary('fbad2', 70, [champ('Premier League Champion', { group: 'PL', date: null })]));
    await screen.findByText('Titles');
    expect(text()).not.toMatch(ANY_DAY);
    expect(text()).not.toContain('Season ran');
  });
});

describe('FBAJC season page', () => {
  const page = (s: SummaryFile) => {
    stub('fbajc', s);
    at('/history/fbajc/season/75', '/history/fbajc/season/:season', <JcSeasonPage />);
  };
  it('shows the national championship date and the NIT date (from jc.nit when the entry has none)', async () => {
    const jc = { confChampions: [], national: [], conference: [], allAmerican: null, mvp: { mm: null, nit: null }, nit: { champion: 'BBB', runnerUp: 'AAA', date: '2026-03-30' } };
    page(summary('fbajc', 75, [champ('FBAJC National Champion', { date: '2026-04-05' }), champ('NIT Champion', { champion: 'Beta', teamId: 'BBB' })], { jc }));
    expect(await screen.findByText(/Apr 5, 2026/)).toBeTruthy();
    expect(screen.getByText(/Mar 30, 2026/)).toBeTruthy();
  });
  it('shows the span', async () => {
    page(summary('fbajc', 75, [champ('FBAJC National Champion')], { span: SPAN_IN }));
    expect(await screen.findByText(`Season ran ${SPAN}`)).toBeTruthy();
  });
  it('shows nothing without a date or span', async () => {
    page(summary('fbajc', 75, [champ('FBAJC National Champion', { date: null })]));
    await screen.findByText('Champions');
    expect(text()).not.toMatch(ANY_DAY);
    expect(text()).not.toContain('Season ran');
  });
});

describe('World Cup season page', () => {
  const wc = (extra: Partial<Champion> = {}) => champ('World Cup Champion', extra);
  const page = (s: SummaryFile) => {
    stub('fbawc', s, { '/api/state/leagues/fbawc/hosts.json': { hosts: [] } });
    at('/history/fbawc/season/78', '/history/fbawc/season/:season', <WcSeasonPage />);
  };
  it('shows the final date', async () => {
    page(summary('fbawc', 78, [wc({ date: '2026-10-12' })]));
    expect(await screen.findByText(/Final Oct 12, 2026/)).toBeTruthy();
  });
  it('shows the span', async () => {
    page(summary('fbawc', 78, [wc()], { span: SPAN_IN }));
    expect(await screen.findByText(`Season ran ${SPAN}`)).toBeTruthy();
  });
  it('shows nothing without a date or span', async () => {
    page(summary('fbawc', 78, [wc({ date: null })]));
    await screen.findByText('Tournament MVP');
    expect(text()).not.toMatch(ANY_DAY);
    expect(text()).not.toContain('Season ran');
  });
});

describe('FBA draft season page', () => {
  const pick = { pick: 1, teamId: 'AAA', teamName: 'Alpha', viaTeamId: null, name: 'Ray Allen', playerId: 'p00001', pos: 'PG', detail: 'Senior', college: 'Duke' };
  const page = (history: DraftHistoryFile) => {
    stub('fba', null, { '/api/state/leagues/fba/draftHistory.json': history });
    at('/history/fba/drafts/75', '/history/fba/drafts/:season', <DraftSeasonPage />);
  };
  it('shows the draft date and the expansion draft its own', async () => {
    page({ drafts: [
      { season: 75, kind: 'draft', date: '2026-10-12', picks: [pick] },
      { season: 75, kind: 'expansion', date: '2026-09-01', picks: [pick] },
    ] });
    expect(await screen.findByText(`Draft: ${DAY}`)).toBeTruthy();
    expect(screen.getByText('Expansion draft: Sep 1, 2026')).toBeTruthy();
  });
  it('shows nothing for a null or missing date', async () => {
    page({ drafts: [
      { season: 75, kind: 'draft', date: null, picks: [pick] },
      { season: 75, kind: 'expansion', picks: [pick] },
    ] });
    await screen.findByText('Expansion draft');
    expect(text()).not.toMatch(ANY_DAY);
  });
});

describe('D2 draft season page', () => {
  const pick = { pick: 1, teamId: 'AAA', teamName: 'Alpha', name: 'Ray Allen', playerId: 'p00001', pos: 'G', age: 19, rating: 88 };
  const page = (draft: D2DraftHistoryFile['drafts'][number]) => {
    stub('fbad2', null, { '/api/state/leagues/fbad2/draftHistory.json': { drafts: [draft] } });
    at('/history/fbad2/drafts/70', '/history/fbad2/drafts/:season', <D2DraftSeasonPage />);
  };
  it('shows the draft date', async () => {
    page({ season: 70, date: '2026-10-12', picks: [pick] });
    expect(await screen.findByText(`Draft: ${DAY}`)).toBeTruthy();
  });
  it('shows nothing for a null or missing date', async () => {
    page({ season: 70, date: null, picks: [pick] });
    await screen.findByText('Ray Allen');
    expect(text()).not.toMatch(ANY_DAY);
  });
});
