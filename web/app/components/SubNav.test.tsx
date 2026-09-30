// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubNav } from './SubNav';

afterEach(cleanup);

describe('SubNav', () => {
  it('renders route links with the current one active', () => {
    render(<MemoryRouter initialEntries={['/b']}><SubNav label="Sections" items={[{ label: 'A', to: '/a' }, { label: 'B', to: '/b' }]} /></MemoryRouter>);
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'B' }).className).toContain('active');
    expect(screen.getByRole('link', { name: 'A' }).className).not.toContain('active');
  });
  it('renders in-page tabs with aria-selected and reports clicks', () => {
    const onSelect = vi.fn();
    render(<SubNav label="Season" items={[{ label: 'Standings', id: 'standings' }, { label: 'Awards', id: 'awards' }]} active="awards" onSelect={onSelect} />);
    expect(screen.getByRole('tablist', { name: 'Season' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Awards' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(onSelect).toHaveBeenCalledWith('standings');
  });
});
