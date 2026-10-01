// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../shell/Layout';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('jc routes', () => {
  for (const [path, title] of [['scores', 'Scores'], ['standings', 'Standings'], ['rankings', 'Rankings'], ['tournaments', 'Tournaments'], ['leaders', 'Leaders']]) {
    it(`serves the ${title} page`, async () => {
      render(<MemoryRouter initialEntries={[`/league/fbajc/${path}`]}><Layout /></MemoryRouter>);
      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    });
  }
});
