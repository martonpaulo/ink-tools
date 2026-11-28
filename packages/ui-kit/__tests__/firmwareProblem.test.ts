/** The firmware notice (#492): plain words, nothing when nothing is off. */
import {firmwareProblem} from '../src';

const STILL = 'Everything else in Synthetic still works.';

describe('firmwareProblem', () => {
  it('is null when no feature is off, so nothing extra shows', () => {
    expect(firmwareProblem([], STILL)).toBeNull();
  });

  it('names one feature and says what still works', () => {
    const problem = firmwareProblem(['Shape detection'], STILL);
    expect(problem?.what).toBe('Shape detection is turned off');
    expect(problem?.reason).toContain('A Supernote update');
    expect(problem?.reason).toContain(STILL);
  });

  it('lists several features in plain words and uses no developer term', () => {
    const problem = firmwareProblem(['Crop', 'Erase', 'Insert'], STILL);
    expect(problem?.what).toBe('Crop, Erase and Insert are turned off');
    expect(`${problem?.what} ${problem?.reason}`).not.toMatch(/registry|probe|kill switch|firmware|[a-z]+\.[a-z]+-/i);
  });
});
