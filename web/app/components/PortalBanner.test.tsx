// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterPortal } from '../../engine/college/portal';
import { collegeCurrentClassState } from '../../engine/college/testFixtures';
import type { CalendarFile } from '../../engine/shared/types';
import { stubApi } from '../d2/testDocs';
import { recruitingDocs } from '../college/testDocs';
import { PortalBanner } from './PortalBanner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stepDone = (cal: CalendarFile, ...ids: string[]): CalendarFile => ({
  ...cal, steps: cal.steps.map(s => (ids.includes(s.id) ? { ...s, done: true } : s)),
});
const renderBanner = () => render(<MemoryRouter><PortalBanner /></MemoryRouter>);

describe('PortalBanner', () => {
  it('says how many players are in the open portal, with a link', async () => {
    const s = collegeCurrentClassState();
    const opened = { ...s, calendar: stepDone(s.calendar, 'make-s79-schedules') };
    const r = enterPortal(opened, ['p00485', 'p00488'], { batchId: 'b' });
    if (!r.ok) throw new Error('setup');
    stubApi(recruitingDocs(r.state));
    renderBanner();
    expect(await screen.findByText('The S79 transfer portal is open · 2 players in it')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the portal ▸' }).getAttribute('href')).toBe('/league/fbajc/portal');
  });

  it('says 0 players when the board does not exist yet', async () => {
    const s = collegeCurrentClassState();
    stubApi(recruitingDocs({ ...s, calendar: stepDone(s.calendar, 'make-s79-schedules') }, { recruiting: false }));
    renderBanner();
    expect(await screen.findByText('The S79 transfer portal is open · 0 players in it')).toBeTruthy();
  });

  it('renders nothing while the portal is closed', async () => {
    stubApi(recruitingDocs(collegeCurrentClassState()));
    const { container } = renderBanner();
    await waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(c => String(c[0]).includes('S78/recruiting.json'))).toBe(true));
    await new Promise(r => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
