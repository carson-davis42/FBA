// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Team } from '../../engine/shared/types';
import { FeatureIcon } from './FeatureIcon';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const badge = { bg: '#000', fg: '#fff' };
const team = (teamId: string): Team => ({ teamId, name: teamId, abbr: teamId, group: 'E', logoFolder: `${teamId} Folder`, badge });

describe('FeatureIcon teams', () => {
  it('draws the current season logo of each team, not the season it finished in', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url === '/api/state/meta.json'
        ? new Response(JSON.stringify({ currentSeason: 80, rosterSeason: { fba: 80, fbad2: 80, fbajc: 79, fbawc: 78 }, lastSeason: { fba: 79, fbad2: 79, fbajc: 78, fbawc: 78 } }))
        : new Response('{}', { status: 404 })
    )));
    const { container } = render(<FeatureIcon name="teams" teams={[team('A'), team('B')]} season={79} />);
    await waitFor(() => expect([...container.querySelectorAll('img')].every(i => i.getAttribute('src')!.includes('/80?'))).toBe(true));
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the given season until the current one is known', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const { container } = render(<FeatureIcon name="teams" teams={[team('A')]} season={79} />);
    expect(container.querySelector('img')!.getAttribute('src')).toContain('/79?');
  });
});
