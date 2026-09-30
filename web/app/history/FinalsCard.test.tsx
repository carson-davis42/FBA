// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Champion, FranchisesFile, Team } from '../../engine/shared/types';
import { FinalsCard, finalsWins } from './FinalsCard';

afterEach(cleanup);

const team = (teamId: string, name: string, abbr: string): Team => ({ teamId, name, abbr, group: null, logoFolder: null, badge: { bg: '#000', fg: '#fff' } });
const teams = [team('SAS', 'San Antonio Spirits', 'SAS'), team('CP', 'Columbus Pirates', 'CP')];
const franchises: FranchisesFile = { franchises: [
  { teamId: 'SAS', eras: [{ name: 'San Antonio', abbr: 'USA', city: 'San Antonio, Texas', from: 1, to: 27 }] },
  { teamId: 'CP', eras: [{ name: 'Former Pirates', abbr: 'FP', city: 'Columbus, Ohio', from: 1, to: 34 }] },
] };
const champion: Champion = { title: 'FBA Champion', champion: 'San Antonio', runnerUp: 'Former Pirates', score: '1–0', finalsMvp: null };

describe('finalsWins', () => {
  it('reads en dash and hyphen scores, winner first', () => {
    expect(finalsWins('1–0')).toEqual([1, 0]);
    expect(finalsWins('4-1')).toEqual([4, 1]);
    expect(finalsWins(null)).toBeNull();
    expect(finalsWins('OT')).toBeNull();
  });
});

describe('FinalsCard', () => {
  it('shows the champion and runner-up as a decided Finals box', () => {
    const { container } = render(<FinalsCard champion={champion} conf={{ E: 'Former Pirates', W: 'San Antonio' }} teams={teams} franchises={franchises} season={20} />);
    const won = container.querySelector('.series-box.finals .series-side.won');
    const lost = container.querySelector('.series-box.finals .series-side:not(.won)');
    expect(won?.textContent).toContain('San Antonio');
    expect(won?.querySelector('.seed')?.textContent).toBe('W');
    expect(won?.querySelector('.wins')?.textContent).toBe('1');
    expect(lost?.textContent).toContain('Former Pirates');
    expect(lost?.querySelector('.seed')?.textContent).toBe('E');
    expect(lost?.querySelector('.wins')?.textContent).toBe('0');
    expect(container.querySelectorAll('.series-box.finals .team-name')).toHaveLength(2);
    expect(container.querySelector('.champ-badge')).toBeTruthy();
    expect(screen.getByText("The full bracket for S20 wasn't recorded.")).toBeTruthy();
  });
  it('works without franchises, conference champions or a score', () => {
    const { container } = render(<FinalsCard champion={{ ...champion, score: null }} conf={null} teams={teams} franchises={null} season={20} />);
    expect(container.querySelector('.series-side.won')?.textContent).toContain('San Antonio');
    expect(container.querySelector('.series-side.won .seed')?.textContent).toBe('');
    expect(container.querySelector('.series-side.won .wins')?.textContent).toBe('');
    expect(container.querySelectorAll('.team-name')).toHaveLength(0);
  });
});
