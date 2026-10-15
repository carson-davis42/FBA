// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScoreBug, type BugSide } from './GameViews';

afterEach(cleanup);

const side = (label: string, light?: boolean): BugSide => ({ label, score: 0, style: {}, light });

describe('ScoreBug', () => {
  it('uses the light style when both sides are college teams', () => {
    const { container } = render(<ScoreBug away={side('SF', true)} home={side('MSU', true)} middle="Q1" />);
    expect(container.querySelector('.scorebug')?.classList.contains('scorebug-light')).toBe(true);
  });
  it('keeps the solid team colours otherwise', () => {
    const { container } = render(<ScoreBug away={side('BOS')} home={side('NYK')} middle="Q1" />);
    expect(container.querySelector('.scorebug')?.classList.contains('scorebug-light')).toBe(false);
  });
});
