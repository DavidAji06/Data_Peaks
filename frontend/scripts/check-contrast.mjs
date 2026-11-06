/**
 * Checks the colour tokens in app/globals.css against WCAG 2.1 AA.
 * Text pairs need 4.5:1; UI parts and graphics (borders, focus outline, bars, marks) need 3:1.
 * Run: npm run check:contrast   (exits with 1 if any pair fails)
 */
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

const TEXT = 4.5;
const UI = 3;
const pairs = [
  // [foreground, background, minimum, what it is]
  ['ink', 'canvas', TEXT, 'body text'],
  ['ink', 'surface', TEXT, 'text on cards'],
  ['ink', 'surface-muted', TEXT, 'text on quiet panels'],
  ['ink', 'accent-soft', TEXT, 'text in notices'],
  ['ink', 'band', TEXT, 'labels over the band'],
  ['ink-muted', 'canvas', TEXT, 'secondary text'],
  ['ink-muted', 'surface', TEXT, 'secondary text on cards'],
  ['ink-muted', 'surface-muted', TEXT, 'secondary text on panels'],
  ['accent', 'surface', TEXT, 'links on cards'],
  ['accent', 'canvas', TEXT, 'links on the page'],
  ['accent', 'accent-soft', TEXT, 'accent text in notices'],
  ['on-accent', 'accent', TEXT, 'primary button text'],
  ['on-accent', 'accent-hover', TEXT, 'primary button text (hover)'],
  ['risk-low', 'risk-low-soft', TEXT, 'Low chip'],
  ['risk-medium', 'risk-medium-soft', TEXT, 'Medium chip'],
  ['risk-high', 'risk-high-soft', TEXT, 'High chip'],
  ['risk-low', 'surface', TEXT, 'Low text on cards'],
  ['risk-medium', 'surface', TEXT, 'Medium text on cards'],
  ['risk-high', 'surface', TEXT, 'High text on cards'],
  ['line-strong', 'surface', UI, 'input borders'],
  ['line-strong', 'canvas', UI, 'input borders on the page'],
  ['accent', 'surface', UI, 'focus outline, your mark'],
  ['accent', 'band', UI, 'your mark over the band'],
  ['ink', 'band', UI, 'median mark over the band'],
  ['risk-low-solid', 'surface', UI, 'Low bars'],
  ['risk-medium-solid', 'surface', UI, 'Medium bars'],
  ['risk-high-solid', 'surface', UI, 'High bars'],
];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failed = 0;
console.log('Pair'.padEnd(36) + 'Ratio'.padStart(7) + '  Need  Result  Use');
for (const [fg, bg, min, use] of pairs) {
  if (!tokens[fg] || !tokens[bg]) {
    console.log(`${`${fg} on ${bg}`.padEnd(36)}  missing token`);
    failed++;
    continue;
  }
  const r = ratio(tokens[fg], tokens[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${`${fg} on ${bg}`.padEnd(36)}${r.toFixed(2).padStart(7)}  ${String(min).padEnd(4)}  ${ok ? 'pass  ' : 'FAIL  '}  ${use}`);
}
console.log(failed ? `\n${failed} pair(s) fail WCAG AA.` : `\nAll ${pairs.length} pairs pass WCAG AA.`);
process.exit(failed ? 1 : 0);
