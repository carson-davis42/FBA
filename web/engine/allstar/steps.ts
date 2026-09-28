import { completePause } from '../season/moves';
import { blockingPause, seasonFail, type SeasonResult, type SeasonState } from '../season/state';
import type { AllStarFile } from '../shared/types';
import { ASG_PICKS } from './asgDraft';
import { drawFilled } from './contestDraw';
import { YSG_PICKS } from './youngStars';

export type AllStarStep = 'selections' | 'asgDraft' | 'contestDraw' | 'fivePoint' | 'dunk' | 'ysgDraft' | 'ysg' | 'asg' | 'wrapup' | 'done';

export const STEP_ORDER: AllStarStep[] = ['selections', 'asgDraft', 'contestDraw', 'fivePoint', 'dunk', 'ysgDraft', 'ysg', 'asg', 'wrapup'];
export const STEP_LABEL: Record<AllStarStep, string> = {
  selections: 'Selections', asgDraft: 'ASG draft', contestDraw: 'Contest draw', fivePoint: '5pt contest', dunk: 'Dunk contest',
  ysgDraft: 'Young-Star draft', ysg: 'Young-Star tournament', asg: 'All-Star Game', wrapup: 'Wrap-up', done: 'Done',
};

export function allStarStep(doc: AllStarFile | null): AllStarStep {
  if (!doc?.selections) return 'selections';
  if (!doc.asgDraft || doc.asgDraft.picks.length < ASG_PICKS) return 'asgDraft';
  if (!drawFilled(doc)) return 'contestDraw';
  if (!doc.fivePoint) return 'fivePoint';
  if (!doc.dunk) return 'dunk';
  if (!doc.ysgDraft || doc.ysgDraft.picks.length < YSG_PICKS) return 'ysgDraft';
  if (!doc.ysg) return 'ysg';
  if (!doc.asg) return 'asg';
  return doc.locked ? 'done' : 'wrapup';
}

export function finishAllStar(state: SeasonState): SeasonResult {
  const p = blockingPause(state);
  if (!p || p.kind !== 'allstar' || !state.schedule) return seasonFail(['The All-Star weekend is not up yet']);
  if (allStarStep(state.allstar) !== 'wrapup') return seasonFail(['Finish every All-Star event first']);
  return {
    ok: true,
    state: { ...state, allstar: { ...state.allstar!, locked: true }, schedule: completePause(state.schedule, 'allstar')! },
    changed: ['allstar', 'schedule'],
    label: 'Finish All-Star weekend',
  };
}
