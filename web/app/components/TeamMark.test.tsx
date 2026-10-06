// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Team } from '../../engine/shared/types';
import { TeamMark } from './TeamMark';
import { logoUrl } from './logoUrl';

afterEach(cleanup);
const base: Team = { teamId: 'GER', name: 'Germany', abbr: 'GER', group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } };

describe('TeamMark', () => {
  it('draws a flag when the team has one', () => {
    render(<TeamMark team={{ ...base, flag: 'de' }} season={78} />);
    expect(screen.getByAltText('Germany flag').getAttribute('src')).toMatch(/de.*\.svg/);
  });
  it('falls back to the badge without a flag', () => {
    render(<TeamMark team={base} season={78} />);
    expect(screen.queryByAltText('Germany flag')).toBeNull();
    expect(screen.getByText('GER')).toBeTruthy();
  });
  it('can be decorative (empty alt) when the name is shown beside it', () => {
    const { container } = render(<TeamMark team={{ ...base, flag: 'de' }} season={78} decorative />);
    expect(screen.queryByAltText('Germany flag')).toBeNull();
    expect(container.querySelector('img.team-flag')?.getAttribute('alt')).toBe('');
  });
  it('asks for its own file inside a shared logo folder', () => {
    const { container } = render(<TeamMark team={{ ...base, name: 'Texas A&M', logoFolder: 'FBAJC_Final', logoFile: 'Texas A&M.png' }} season={78} />);
    expect(container.querySelector('img.team-mark')?.getAttribute('src')).toBe(logoUrl('FBAJC_Final', 78, 'Texas A&M.png'));
  });
  it('uses the season route alone for a team without a file', () => {
    const { container } = render(<TeamMark team={{ ...base, logoFolder: 'Atlanta Venom' }} season={78} />);
    expect(container.querySelector('img.team-mark')?.getAttribute('src')).toBe(logoUrl('Atlanta Venom', 78));
  });
});
