// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBio } from '../../engine/history/career';
import type { AwardKey, Team } from '../../engine/shared/types';
import { CareerSection } from './CareerSection';

afterEach(cleanup);

const team = (teamId: string, name: string): Team => ({ teamId, name, abbr: teamId, group: null, logoFolder: null, badge: { bg: '#112233', fg: '#ffffff' } });
const none = {} as Record<AwardKey, number>;

describe('CareerSection national teams', () => {
  const career = parseBio({ born: 'Born-S55', entries: ['Cornell-S73', 'D2(Guadalajara CB)-S77-pres.', 'WC(Mexico)-S78', '1x WC Champion'] });
  const render1 = () => render(
    <MemoryRouter>
      <CareerSection career={career} born="Born-S55" totals={none} teams={{ fba: [], d2: [team('GUA', 'Guadalajara CB')], college: [], wc: [team('MEX', 'Mexico')] }} />
    </MemoryRouter>,
  );

  it('keeps the club run in one row and puts the World Cup in its own table', () => {
    render1();
    const club = screen.getAllByRole('table')[0];
    expect(within(club).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual(['CollegeCornellS73', expect.stringContaining('Guadalajara CB')]);
    const national = screen.getByRole('table', { name: 'National team' });
    expect(within(national).getByText('S78')).toBeTruthy();
    expect(within(national).getByText('1x WC Champion')).toBeTruthy();
  });

  it('links the national team to its roster page', () => {
    render1();
    expect(within(screen.getByRole('table', { name: 'National team' })).getByRole('link', { name: /Mexico/ }).getAttribute('href')).toBe('/league/fbawc/team/MEX');
  });

  it('shows no national table without a call-up', () => {
    render(<MemoryRouter><CareerSection career={parseBio({ born: 'Born-S55', entries: ['Cornell-S73'] })} born={null} totals={none} teams={{ fba: [], d2: [], college: [] }} /></MemoryRouter>);
    expect(screen.queryByRole('table', { name: 'National team' })).toBeNull();
  });
});
