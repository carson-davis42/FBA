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

  it('links an old D2 team to the team it became, under the name the bio uses', () => {
    const c = parseBio({ born: 'Born-S40', entries: ['D2(Pearland)-S53-S58', 'D2(Orlando)-S59'] });
    render(<MemoryRouter><CareerSection career={c} born={null} totals={none} teams={{ fba: [], d2: [team('AUS', 'Austin'), team('MIA', 'Miami')], college: [] }} /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map(l => [l.textContent, l.getAttribute('href')])).toEqual([[expect.stringContaining('Pearland'), '/history/fbad2/teams/AUS'], [expect.stringContaining('Orlando'), '/history/fbad2/teams/MIA']]);
  });
  it('links a D2 team the bio names by city to the club renamed after its logo, with the sheet spellings', () => {
    const c = parseBio({ born: 'Born-S40', entries: ['D2(Lyon)-S71-S78', 'D2(Kiev)-S79', 'D2(Pearland)-S53'] });
    const t = (id: string, name: string, city: string) => ({ ...team(id, name), city });
    render(<MemoryRouter><CareerSection career={c} born={null} totals={none} teams={{ fba: [], d2: [t('LYON', 'Sporting Lyon', 'Lyon'), t('KIEV', 'SK Kyiv', 'Kyiv'), t('AUS', 'Austin BC', 'Austin')], college: [] }} /></MemoryRouter>);
    expect(screen.getAllByRole('link').map(l => l.getAttribute('href'))).toEqual(['/history/fbad2/teams/LYON', '/history/fbad2/teams/KIEV', '/history/fbad2/teams/AUS']);
  });
});
