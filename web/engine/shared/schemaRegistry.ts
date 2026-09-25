import type { z } from 'zod';
import {
  CalendarFile, LogoManifest, MetaFile, PlayersFile, ResultsFile, RostersFile, SummaryFile, TeamsFile,
} from './types';

const L = '(fba|fbad2|fbajc|fbawc)';

const RULES: [RegExp, z.ZodTypeAny][] = [
  [/^players\.json$/, PlayersFile],
  [/^meta\.json$/, MetaFile],
  [/^calendar\.json$/, CalendarFile],
  [/^logos\/manifest\.json$/, LogoManifest],
  [new RegExp(`^leagues/${L}/teams\\.json$`), TeamsFile],
  [new RegExp(`^leagues/${L}/S\\d+/rosters\\.json$`), RostersFile],
  [new RegExp(`^leagues/${L}/S\\d+/summary\\.json$`), SummaryFile],
  [new RegExp(`^leagues/${L}/S\\d+/results\\.json$`), ResultsFile],
];

export function schemaForPath(rel: string): z.ZodTypeAny | null {
  for (const [re, schema] of RULES) if (re.test(rel)) return schema;
  return null;
}
