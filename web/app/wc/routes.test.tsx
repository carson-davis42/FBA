// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../shell/Layout';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('wc routes', () => {
  it('serves the qualifying page', async () => {
    render(<MemoryRouter initialEntries={['/league/fbawc/qualifying']}><Layout /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Qualifying' })).toBeTruthy();
  });
  it('serves the World Cup page', async () => {
    render(<MemoryRouter initialEntries={['/league/fbawc/worldcup']}><Layout /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'World Cup' })).toBeTruthy();
  });
});
