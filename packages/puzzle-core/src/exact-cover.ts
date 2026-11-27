/**
 * Exact cover by dancing links (Knuth's Algorithm X), the constraint core's counter (#380).
 *
 * A problem is a number of columns (constraints that must each be met exactly once) and rows
 * (choices, each meeting some columns). `search` counts covers up to a limit, so a uniqueness
 * check stops at the second solution, and keeps the first cover it found. Sudoku and its variants,
 * dominoes and polyomino packings all reduce to it.
 */

export interface ExactCoverProblem {
  columns: number;
  /** Each row lists the columns it covers. */
  rows: readonly (readonly number[])[];
}

export interface ExactCoverResult {
  /** Covers found, never more than the limit. */
  count: number;
  /** The row indices of the first cover found, or null with none. */
  first: number[] | null;
  /** True when the search stopped at its `budget` of steps: the count is then a lower bound. */
  exhausted: boolean;
}

/**
 * Counts the exact covers that contain every row of `chosen`, stopping at `limit`. Rows are tried
 * in their given order, so a caller that shuffles them gets a random first cover. With a `budget`,
 * the search also stops after that many rows tried and says it is `exhausted`, so a caller that
 * only wants some cover can give up on a slow problem and try another, the same way every run.
 */
export function searchExactCover(
  problem: ExactCoverProblem,
  limit: number,
  chosen: readonly number[] = [],
  budget = Infinity,
): ExactCoverResult {
  const { columns, rows } = problem;
  let nodes = columns + 1;
  for (const row of rows) nodes += row.length;
  const left = new Int32Array(nodes);
  const right = new Int32Array(nodes);
  const up = new Int32Array(nodes);
  const down = new Int32Array(nodes);
  const column = new Int32Array(nodes);
  const rowOf = new Int32Array(nodes);
  const size = new Int32Array(columns + 1);
  const firstNode = new Int32Array(rows.length);

  // Node 0 is the root; nodes 1..columns are the column headers.
  for (let c = 0; c <= columns; c++) {
    left[c] = c === 0 ? columns : c - 1;
    right[c] = c === columns ? 0 : c + 1;
    up[c] = c;
    down[c] = c;
    column[c] = c;
  }
  let next = columns + 1;
  rows.forEach((row, r) => {
    let first = -1;
    for (const col of row) {
      if (col < 0 || col >= columns) throw new RangeError(`row ${r} names column ${col} of ${columns}`);
      const header = col + 1;
      const node = next++;
      column[node] = header;
      rowOf[node] = r;
      up[node] = up[header];
      down[node] = header;
      down[up[header]] = node;
      up[header] = node;
      size[header]++;
      if (first < 0) {
        first = node;
        left[node] = node;
        right[node] = node;
      } else {
        left[node] = left[first];
        right[node] = first;
        right[left[first]] = node;
        left[first] = node;
      }
    }
    firstNode[r] = first;
  });

  const cover = (c: number): void => {
    right[left[c]] = right[c];
    left[right[c]] = left[c];
    for (let i = down[c]; i !== c; i = down[i]) {
      for (let j = right[i]; j !== i; j = right[j]) {
        down[up[j]] = down[j];
        up[down[j]] = up[j];
        size[column[j]]--;
      }
    }
  };
  const uncover = (c: number): void => {
    for (let i = up[c]; i !== c; i = up[i]) {
      for (let j = left[i]; j !== i; j = left[j]) {
        size[column[j]]++;
        down[up[j]] = j;
        up[down[j]] = j;
      }
    }
    right[left[c]] = c;
    left[right[c]] = c;
  };

  const partial: number[] = [];
  // Pre-chosen rows are covered first; two that clash leave no cover at all.
  const coveredByChoice = new Set<number>();
  for (const r of chosen) {
    const start = firstNode[r];
    if (start < 0) continue;
    let node = start;
    do {
      if (coveredByChoice.has(column[node])) return { count: 0, first: null, exhausted: false };
      coveredByChoice.add(column[node]);
      node = right[node];
    } while (node !== start);
    node = start;
    do {
      cover(column[node]);
      node = right[node];
    } while (node !== start);
    partial.push(r);
  }

  let count = 0;
  let first: number[] | null = null;
  let tried = 0;
  let exhausted = false;
  const solve = (): boolean => {
    if (right[0] === 0) {
      count++;
      if (!first) first = partial.slice();
      return count >= limit;
    }
    // The column with the fewest rows (ties to the leftmost) keeps the tree small.
    let best = right[0];
    for (let c = right[best]; c !== 0; c = right[c]) if (size[c] < size[best]) best = c;
    if (size[best] === 0) return false;
    cover(best);
    for (let r = down[best]; r !== best; r = down[r]) {
      if (++tried > budget) {
        exhausted = true;
        uncover(best);
        return true;
      }
      partial.push(rowOf[r]);
      for (let j = right[r]; j !== r; j = right[j]) cover(column[j]);
      const done = solve();
      for (let j = left[r]; j !== r; j = left[j]) uncover(column[j]);
      partial.pop();
      if (done) {
        uncover(best);
        return true;
      }
    }
    uncover(best);
    return false;
  };
  if (limit > 0) solve();
  return { count, first, exhausted };
}
