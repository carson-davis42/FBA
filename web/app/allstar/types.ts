import type { AllStarResult, FbaPlayer } from '../../engine/allstar/common';
import type { SeasonState } from '../../engine/season/state';
import type { AllStarFile } from '../../engine/shared/types';

export interface StepProps {
  state: SeasonState;
  doc: AllStarFile | null;
  list: FbaPlayer[];
  /** True when viewing a finished step (or the whole weekend is done). */
  readOnly: boolean;
  saving: boolean;
  /** Commits an All-Star result; resolves false (after showing the problem) when it failed. */
  save: (r: AllStarResult) => Promise<boolean>;
  /** Tells the page to keep showing this step (even once the doc's current step has moved on) while a dice reveal is in progress. */
  onRevealChange?: (active: boolean) => void;
}
