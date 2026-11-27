// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { bigCutDoc } from '../../engine/d2/testFixtures';
import { applyAllSuggestions } from '../../engine/rank/ranking';
import { takeRestMerged } from '../../engine/rank/positionRanking';
import type { RankingFile } from '../../engine/shared/types';
import { RankingTable } from '../rank/RankingTable';
import { FillPreview } from './FillPreview';

afterEach(cleanup);

const name = (id: string) => id;
const preview = (doc: RankingFile) => render(<MemoryRouter><FillPreview doc={doc} name={name} teamLabel={() => 'Reserves'} /></MemoryRouter>);

describe('FillPreview', () => {
  it('waits for the whole top 100 to be rated', () => {
    preview(takeRestMerged(bigCutDoc(), name));
    expect(screen.getByText(/appear once all of your top 100 are rated/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists everyone kept outside the top 100 with an automatic rating, from #101', () => {
    preview(applyAllSuggestions(takeRestMerged(bigCutDoc(), name)));
    const rows = within(screen.getByRole('table', { name: 'Rated by position rank' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(50);
    expect(rows[0].firstElementChild!.textContent).toBe('101');
    expect(rows.at(-1)!.lastElementChild!.textContent).toBe('65');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('RankingTable with the D2 top 100', () => {
  const table = (doc: RankingFile) => render(
    <MemoryRouter>
      <RankingTable doc={doc} name={name} teamLabel={() => 'Reserves'} otherLabel="FBA" onChange={() => {}} extraBlockers={[]} finishLabel="Finish ratings" onFinish={() => {}} busy={false} positionMerge />
    </MemoryRouter>,
  );

  it('counts down to 100 while ranking', () => {
    table(bigCutDoc());
    expect(screen.getByRole('heading', { name: 'Next up · 100 to go for the top 100' })).toBeTruthy();
    expect(screen.getByText("100 players aren't ranked yet")).toBeTruthy();
  });

  it('shows rating boxes for the 100 once they are ranked', () => {
    table(takeRestMerged(bigCutDoc(), name));
    expect(screen.queryByRole('table', { name: 'Next up' })).toBeNull();
    expect(screen.getAllByLabelText(/^New rating for/)).toHaveLength(100);
  });
});
