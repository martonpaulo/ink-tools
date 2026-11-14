/**
 * The search lab's catalogue keys every run's judgment and metrics by case id, so two cases
 * with one id overwrite each other's verdict (lab/README.md, «Judge a run»).
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';

type LabCase = {id: string; category: string; query: string; expect: string};

const cases: LabCase[] = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'lab', 'cases.json'), 'utf8'),
).cases;

describe('the search lab catalogue', () => {
  it('gives every case an id of its own', () => {
    const seen = new Set<string>();
    const repeated = cases.map(c => c.id).filter(id => seen.has(id) || !seen.add(id));
    expect(repeated).toEqual([]);
  });

  it('gives every case an id, a category, a query and an expectation', () => {
    const incomplete = cases.filter(c => !c.id || !c.category || !c.query || !c.expect);
    expect(incomplete).toEqual([]);
  });
});
