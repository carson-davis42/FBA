import type { Badge } from '../engine/shared/types';

export function badgeFor(name: string): Badge {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return { bg: `hsl(${h % 360} 55% 36%)`, fg: '#ffffff' };
}
