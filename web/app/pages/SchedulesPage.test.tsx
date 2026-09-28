// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { d2SeasonState, fbaSeasonState } from '../../engine/season/testFixtures';
import { META, stubApi } from '../d2/testDocs';
import { SchedulesPage } from './SchedulesPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function docs(withSchedules: boolean): Record<string, unknown> {
  const f = fbaSeasonState();
  const d = d2SeasonState();
  const out: Record<string, unknown> = {
    'meta.json': META,
    'calendar.json': { ...f.calendar, steps: f.calendar.steps.map(s => ({ ...s, done: false })) },
    'leagues/fba/teams.json': f.teams,
    'leagues/fbad2/teams.json': d.teams,
  };
  if (withSchedules) {
    out['leagues/fba/S79/schedule.json'] = f.schedule;
    out['leagues/fba/S79/results.json'] = f.results;
    out['leagues/fbad2/S79/schedule.json'] = d.schedule;
    out['leagues/fbad2/S79/results.json'] = d.results;
  }
  return out;
}

describe('SchedulesPage', () => {
  it('makes both schedules as one batch', async () => {
    const log = stubApi(docs(false));
    render(<MemoryRouter><SchedulesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Make schedules' }));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Make schedules');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fba/S79/schedule.json', null], ['leagues/fba/S79/results.json', null],
      ['leagues/fbad2/S79/schedule.json', null], ['leagues/fbad2/S79/results.json', null],
      ['calendar.json', '0000000000000001'],
    ]);
  });

  it('shows existing schedules and offers a re-roll', async () => {
    stubApi(docs(true));
    render(<MemoryRouter><SchedulesPage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Re-roll schedules' })).toBeTruthy();
    expect(screen.getByText(/FBA: 16 games/)).toBeTruthy();
  });

  it('shows error when calendar.json fetch fails with non-404', async () => {
    const docMap = docs(false);
    const counts = new Map<string, number>(Object.keys(docMap).map(p => [p, 1]));
    const version = (p: string) => String(counts.get(p) ?? 0).padStart(16, '0');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/state/calendar.json') {
        return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
      }
      const path = url.replace('/api/state/', '');
      if (!(path in docMap)) return new Response(JSON.stringify({ error: `Not found: ${path}` }), { status: 404 });
      return new Response(JSON.stringify(docMap[path]), { headers: { ETag: `"${version(path)}"` } });
    }));
    render(<MemoryRouter><SchedulesPage /></MemoryRouter>);
    expect(await screen.findByText('Server error')).toBeTruthy();
  });
});
