/** White or near-black text for a #RRGGBB background, by WCAG relative luminance (white when ≤ 0.45). */
export function inkFor(hex: string): string {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return lum <= 0.45 ? '#fff' : '#111';
}
