// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Team } from '../../engine/shared/types';
import { TeamName } from './TeamName';

afterEach(cleanup);
const venom: Team = { teamId: 'ATL', name: 'Atlanta Venom', abbr: 'ATL', group: 'E', logoFolder: 'Atlanta Venom', badge: { bg: '#123', fg: '#fff' } };

describe('TeamName', () => {
  it('shows the logo and the full name', () => {
    render(<TeamName team={venom} season={79} />);
    expect(screen.getByText('Atlanta Venom')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Atlanta Venom logo' })).toBeTruthy();
  });
  it('shows the short name and abbreviation variants, with the full name as a title', () => {
    render(<><TeamName team={venom} season={79} variant="short" /><TeamName team={venom} season={79} variant="abbr" /></>);
    expect(screen.getByText('Venom').closest('.team-name')!.getAttribute('title')).toBe('Atlanta Venom');
    expect(screen.getByText('ATL')).toBeTruthy();
  });
  it('links when given a route', () => {
    render(<MemoryRouter><TeamName team={venom} season={79} to="/league/fba/team/ATL" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Atlanta Venom/ }).getAttribute('href')).toBe('/league/fba/team/ATL');
  });
  it('shows name and abbreviation overrides', () => {
    render(<><TeamName team={venom} season={30} name="Former Pirates" abbr="FP" /><TeamName team={venom} season={30} variant="abbr" name="Former Pirates" abbr="FP" /></>);
    expect(screen.getByText('Former Pirates')).toBeTruthy();
    expect(screen.getByText('FP').closest('.team-name')!.getAttribute('title')).toBe('Former Pirates');
    expect(screen.getAllByRole('img', { name: 'Former Pirates logo' })).toHaveLength(2);
  });
});
