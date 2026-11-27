/** Assertions the ink-check tests share (#383, #398, #399). */
import type { CheckResult } from '../src/check/read';

/** A check of a full page with one wrong entry: that entry is marked, every other one is right. */
export function expectOnlyWrong(result: CheckResult, wrong: number, entries: number): void {
  expect(result.wrong).toEqual([wrong]);
  expect(result.right).toHaveLength(entries - 1);
  expect(result.empty).toEqual([]);
  expect(result.unread).toEqual([]);
}
