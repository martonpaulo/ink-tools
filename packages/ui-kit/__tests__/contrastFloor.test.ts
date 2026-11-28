/**
 * The contrast floor (#575): every text colour the tokens give, at every role and state, keeps
 * `textContrast` against what is behind it: paper, or the ink of the title bar. The renders check
 * the drawn text too (renders/rules.ts › contrastBreaks).
 */
import {metrics} from '../src/metrics';
import {textStyles} from '../src/metrics';
import {contrastRatio} from '../renders/rules';

/** A text on the black bar is paper on ink; every other text is on paper. */
const BAR_ROLES = new Set(['barTitle', 'barAction']);

describe('the contrast floor (#575)', () => {
  it('is at least the interface standard 7:1', () => {
    expect(metrics.textContrast).toBeGreaterThanOrEqual(7);
  });

  it.each(Object.entries(textStyles))('keeps the %s text over the floor', (role, style) => {
    const behind = BAR_ROLES.has(role) ? metrics.ink : metrics.paper;
    expect(contrastRatio(style.color, behind)).toBeGreaterThanOrEqual(metrics.textContrast);
  });

  it.each([
    ['context', metrics.context],
    ['placeholder', metrics.placeholder],
  ])('keeps the %s grey over the floor on paper', (_name, colour) => {
    expect(contrastRatio(colour, metrics.paper)).toBeGreaterThanOrEqual(metrics.textContrast);
  });

  it('measures a grey under the floor as under it', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(7);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
  });
});
