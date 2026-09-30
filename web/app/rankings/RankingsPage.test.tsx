// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullD2State, fullFbaState, regularSeasonDone } from '../../engine/playoffs/testFixtures';
import { stubApi } from '../d2/testDocs';
import { seasonDocs } from '../season/testDocs';
import { RankingsPage } from './RankingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/league/:league/rankings" element={<RankingsPage />} /></Routes>
  </MemoryRouter>,
);

describe('RankingsPage', () => {
  it('says when rankings start', async () => {
    stubApi(seasonDocs(fullFbaState()));
    renderAt('/league/fba/rankings');
    expect(await screen.findByText('Rankings start after game 20.')).toBeTruthy();
  });

  it('defaults to the latest mark and lets you pick an earlier one', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullFbaState())));
    renderAt('/league/fba/rankings');
    const picker = (await screen.findByRole('combobox', { name: 'Mark' })) as HTMLSelectElement;
    expect(picker.value).toBe('1290');
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    expect(screen.getAllByText(/^[▲▼]\d+$|^—$|^NEW$/).length).toBeGreaterThan(0);
    fireEvent.change(picker, { target: { value: '20' } });
    expect(picker.value).toBe('20');
  });

  it('ranks one D2 league at a time', async () => {
    stubApi(seasonDocs(regularSeasonDone(fullD2State())));
    renderAt('/league/fbad2/rankings');
    await screen.findByRole('combobox', { name: 'Mark' });
    expect(screen.getAllByRole('listitem')).toHaveLength(16);
    fireEvent.click(screen.getByRole('button', { name: 'IL' }));
    expect(screen.getAllByText(/IL\d\d/).length).toBeGreaterThan(0);
  });
});
