// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLASS_DRAFT, collegeBaseState, collegeClassState, collegeCurrentClassState } from '../../engine/college/testFixtures';
import type { RecruitingFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { RecruitingPage } from './RecruitingPage';
import { recruitingDocs, setupDocs } from './testDocs';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/fbajc/recruiting" element={<RecruitingPage />} /></Routes>
  </MemoryRouter>,
);
const enabled = async (name: string) => {
  const b = await screen.findByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('RecruitingPage', () => {
  it('offers the one-time college setup with its counts, and saves it as one batch', async () => {
    const log = stubApi(setupDocs());
    renderAt('/league/fbajc/recruiting');
    expect(await screen.findByText('4 Seniors leave, 1 player left early, 6 holes')).toBeTruthy();
    fireEvent.click(await enabled('Set up S79 college rosters'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Set up S79 college rosters');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fbajc/S79/rosters.json', null], ['leagues/fbajc/S79/transactions.json', null], ['meta.json', '0000000000000001'],
    ]);
    expect(await screen.findByRole('button', { name: 'Create class' })).toBeTruthy();
  });

  it("says the rosters don't exist yet when the college isn't on the previous season", async () => {
    stubApi(setupDocs(77));
    renderAt('/league/fbajc/recruiting');
    expect(await screen.findByText("The S79 college rosters don't exist yet.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up S79 college rosters' })).toBeNull();
  });

  it('points to Adjust Age while it is not done, and shows the setup card once it is', async () => {
    stubApi(setupDocs(78, { adjustAge: false }));
    renderAt('/league/fbajc/recruiting');
    expect(await screen.findByText('Run Adjust Age to build the S79 college rosters.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Adjust Age' }).getAttribute('href')).toBe('/offseason/adjust-age');
    expect(screen.queryByRole('button', { name: 'Set up S79 college rosters' })).toBeNull();
    cleanup();
    stubApi(setupDocs(78, { adjustAge: true }));
    renderAt('/league/fbajc/recruiting');
    expect(await enabled('Set up S79 college rosters')).toBeTruthy();
  });

  it('opens on the Class tab before the class exists, and the first draft edit creates the recruiting doc', async () => {
    const log = stubApi(recruitingDocs(collegeBaseState(), { recruiting: false }));
    renderAt('/league/fbajc/recruiting');
    fireEvent.click(await screen.findByRole('button', { name: 'Add recruit' }));
    await waitFor(() => expect(log.puts).toHaveLength(1));
    expect(log.puts[0]).toMatchObject({ path: 'leagues/fbajc/S79/recruiting.json', ifMatch: '"null"' });
    expect((log.puts[0].doc as RecruitingFile).classDraft).toEqual([{ name: '', position: 'PG' }]);
    expect(screen.getByRole('link', { name: 'Recruiting' }).getAttribute('href')).toBe('/league/fbajc/recruiting');
  });

  it('creates the class as one batch with the loaded versions', async () => {
    const s = collegeBaseState();
    const log = stubApi(recruitingDocs({ ...s, recruiting: { ...s.recruiting, classDraft: CLASS_DRAFT } }));
    renderAt('/league/fbajc/recruiting?tab=class');
    fireEvent.click(await enabled('Create class'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Create S80 class');
    expect(log.batches[0].writes.map(w => [w.path, w.baseVersion])).toEqual([
      ['leagues/fbajc/S79/recruiting.json', '0000000000000001'], ['players.json', '0000000000000001'],
      ['leagues/fbajc/S79/transactions.json', '0000000000000001'], ['calendar.json', '0000000000000001'],
    ]);
  });

  it('opens on the Board once the class exists, and commits as one batch', async () => {
    const log = stubApi(recruitingDocs(collegeClassState()));
    renderAt('/league/fbajc/recruiting');
    fireEvent.click(await enabled('Commit Zion Carter'));
    fireEvent.click(screen.getByRole('button', { name: 'Duke' }));
    fireEvent.click(await enabled('Confirm commit'));
    await waitFor(() => expect(log.batches).toHaveLength(1));
    expect(log.batches[0].label).toBe('Zion Carter commits to Duke');
    expect(log.batches[0].writes.map(w => w.path)).toEqual([
      'leagues/fbajc/S79/recruiting.json', 'leagues/fbajc/S79/transactions.json',
    ]);
    expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
  });

  it('shows the class list on ?tab=class once the class exists', async () => {
    stubApi(recruitingDocs(collegeClassState()));
    renderAt('/league/fbajc/recruiting?tab=class');
    expect(await screen.findByLabelText('Name of Zion Carter')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Class' }).getAttribute('aria-selected')).toBe('true');
  });

  describe('the class picker', () => {
    const both = () => {
      const docs = recruitingDocs(collegeClassState());
      docs['leagues/fbajc/S78/recruiting.json'] = collegeCurrentClassState().recruiting;
      return docs;
    };

    it('defaults to the class that plays this season when its board exists', async () => {
      stubApi(both());
      renderAt('/league/fbajc/recruiting');
      expect(await screen.findByRole('heading', { name: 'FBAJC recruiting · Class of S79' })).toBeTruthy();
      expect((screen.getByRole('combobox', { name: 'Class' }) as HTMLSelectElement).value).toBe('79');
      expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['S79 class (plays S79)', 'S80 class']);
    });

    it('defaults to the next class when the S78 board does not exist', async () => {
      stubApi(recruitingDocs(collegeClassState()));
      renderAt('/league/fbajc/recruiting');
      expect(await screen.findByRole('heading', { name: 'FBAJC recruiting · Class of S80' })).toBeTruthy();
      expect((screen.getByRole('combobox', { name: 'Class' }) as HTMLSelectElement).value).toBe('80');
    });

    it('switches class with the picker (?class=)', async () => {
      stubApi(both());
      renderAt('/league/fbajc/recruiting');
      await screen.findByRole('heading', { name: 'FBAJC recruiting · Class of S79' });
      fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), { target: { value: '80' } });
      expect(await screen.findByRole('heading', { name: 'FBAJC recruiting · Class of S80' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Class' })).toBeTruthy();
      fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), { target: { value: '79' } });
      expect(await screen.findByRole('heading', { name: 'FBAJC recruiting · Class of S79' })).toBeTruthy();
    });

    it('shows the Board tab only for the S79 class, and its commit writes the S78 board and the S79 rosters', async () => {
      const log = stubApi(both());
      renderAt('/league/fbajc/recruiting?class=79&tab=class');
      fireEvent.click(await enabled('Commit Zion Carter'));
      expect(screen.queryByRole('tab', { name: 'Class' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Board' }).getAttribute('aria-selected')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: 'Duke' }));
      fireEvent.click(await enabled('Confirm commit'));
      await waitFor(() => expect(log.batches).toHaveLength(1));
      expect(log.batches[0].label).toBe('Zion Carter commits to Duke');
      expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
        'leagues/fbajc/S78/recruiting.json', 'leagues/fbajc/S79/rosters.json', 'leagues/fbajc/S79/transactions.json',
      ]);
      expect(log.batches[0].writes.every(w => w.baseVersion === '0000000000000001')).toBe(true);
    });

    it('shows the Class and Board tabs for the S80 class, and its commit writes the S79 board and tx but no rosters', async () => {
      const log = stubApi(both());
      renderAt('/league/fbajc/recruiting?class=80');
      fireEvent.click(await enabled('Commit Zion Carter'));
      expect(screen.getByRole('tab', { name: 'Class' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Board' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Duke' }));
      fireEvent.click(await enabled('Confirm commit'));
      await waitFor(() => expect(log.batches).toHaveLength(1));
      expect(log.batches[0].writes.map(w => w.path).sort()).toEqual([
        'leagues/fbajc/S79/recruiting.json', 'leagues/fbajc/S79/transactions.json',
      ]);
    });
  });
});
