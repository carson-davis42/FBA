// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clinchKind, ClinchLegend, RankCell } from './Clinch';

afterEach(cleanup);

describe('clinch bars', () => {
  it('picks one state per row: promotion/relegation, then conference champion, then the marker', () => {
    expect(clinchKind({ marker: '*', status: '▲' })).toBe('promoted');
    expect(clinchKind({ marker: 'x', status: '▼' })).toBe('relegated');
    expect(clinchKind({ marker: '*', conference: true })).toBe('conference');
    expect(clinchKind({ marker: '*' })).toBe('first');
    expect(clinchKind({ marker: 'x' })).toBe('playoff');
    expect(clinchKind({ marker: 'n' })).toBe('eliminated');
    expect(clinchKind({ marker: null })).toBeNull();
  });

  it('draws a labelled bar on the rank cell, and a plain cell without a state', () => {
    render(<table><tbody><tr><RankCell kind="first" league="fba">1</RankCell><RankCell kind={null} league="fba">2</RankCell></tr></tbody></table>);
    const bar = screen.getByRole('img', { name: 'Clinched the #1 seed' });
    expect(bar.closest('td')?.className).toBe('rank clinch clinch-first');
    expect(bar.closest('td')?.textContent).toBe('1');
    expect(screen.getByText('2').className).toBe('rank');
  });

  it('keys only the states present, in a fixed order, with league wording', () => {
    render(<ClinchLegend kinds={['eliminated', null, 'first', 'promoted', 'first']} league="fbad2" />);
    const items = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(items).toEqual(['Clinched first place', 'Promoted', 'Eliminated']);
  });

  it('renders nothing when no row has clinched anything', () => {
    const { container } = render(<ClinchLegend kinds={[null, null]} league="fba" />);
    expect(container.innerHTML).toBe('');
  });

  it('keys the World Cup states in order and labels the advanced bar', () => {
    render(<ClinchLegend kinds={['eliminated', 'advanced', 'qualified']} league="fbawc" />);
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Qualified', 'Advanced to knockouts', 'Eliminated']);
    cleanup();
    render(<table><tbody><tr><RankCell kind="advanced" league="fbawc">1</RankCell></tr></tbody></table>);
    const bar = screen.getByRole('img', { name: 'Advanced to knockouts' });
    expect(bar.closest('td')?.className).toContain('clinch-advanced');
  });
});
