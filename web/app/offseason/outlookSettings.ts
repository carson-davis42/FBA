import { useState } from 'react';
import { DEFAULT_OUTLOOK, type OutlookSettings } from '../../engine/offseason/prospectOutlook';

const KEY = 'fba-prospect-outlook';
const RANGE: Record<keyof OutlookSettings, [number, number]> = { replaceableAtOrBelow: [1, 99], historyCutoff: [1, 60], d2Reserve: [0, 30] };
const FIELDS = Object.keys(RANGE) as (keyof OutlookSettings)[];

const inRange = (field: keyof OutlookSettings, v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= RANGE[field][0] && v <= RANGE[field][1];

/** The saved numbers; any field that is missing or not a whole number in range takes its default. */
function load(): OutlookSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Record<keyof OutlookSettings, unknown>> | null;
    return Object.fromEntries(FIELDS.map(f => [f, inRange(f, saved?.[f]) ? saved![f] : DEFAULT_OUTLOOK[f]])) as unknown as OutlookSettings;
  } catch {
    return DEFAULT_OUTLOOK;
  }
}

/** The three adjustable numbers of the prospect outlook, kept in the browser (a per-viewer convenience: the page works without storage). */
export function useOutlookSettings(): [OutlookSettings, (patch: Partial<OutlookSettings>) => void] {
  const [settings, setSettings] = useState(load);
  const change = (patch: Partial<OutlookSettings>) => {
    const next = { ...settings };
    for (const f of FIELDS) {
      const v = patch[f];
      if (typeof v === 'number' && Number.isFinite(v)) next[f] = Math.min(RANGE[f][1], Math.max(RANGE[f][0], Math.round(v)));
    }
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage is blocked: the numbers still work for this visit.
    }
  };
  return [settings, change];
}
