import {DEFAULT_WORD_OPTIONS, WordTracker} from '../src/words';
import {accent, letter, stroke} from '../test-support/ink';

const {idleMs, graceMs} = DEFAULT_WORD_OPTIONS;

/** Writes letters 30 px apart (gap 10), starting at `left`, one every 200 ms from `at`. */
function write(tracker: WordTracker, left: number, count: number, at: number) {
  const ready = [];
  for (let i = 0; i < count; i += 1) {
    ready.push(...tracker.add(letter(left + i * 30), at + i * 200));
  }
  return ready;
}

test('one word closes after the idle time, not before', () => {
  const tracker = new WordTracker();
  expect(write(tracker, 0, 4, 0)).toEqual([]);
  expect(tracker.tick(600 + idleMs - 1)).toEqual([]);
  const [word] = tracker.tick(600 + idleMs);
  expect(word.strokes).toHaveLength(4);
  expect(word.rect).toEqual({left: 0, top: 100, right: 110, bottom: 140});
  expect(word.letterHeight).toBe(40);
});

test('a word gap closes the first word; it is handed on after its grace', () => {
  const tracker = new WordTracker();
  write(tracker, 0, 3, 0);
  // Gap 60 px: over 0.8 × 40 and 3 × the 10 px letter gap.
  expect(tracker.add(letter(140), 700)).toEqual([]);
  expect(tracker.nextDeadline()).toBe(700 + graceMs);
  const [first] = tracker.tick(700 + graceMs);
  expect(first.strokes).toHaveLength(3);
  const [second] = tracker.tick(700 + idleMs);
  expect(second.strokes).toHaveLength(1);
});

test('letter gaps inside a word never split it, however long the pause', () => {
  const tracker = new WordTracker();
  let ready = tracker.add(letter(0), 0);
  // 650 ms pauses, the longest measured inside a word, with 10 to 20 px gaps.
  ready = ready.concat(tracker.add(letter(30), 650));
  ready = ready.concat(tracker.add(letter(70), 1300));
  ready = ready.concat(tracker.add(letter(100), 1950));
  expect(ready).toEqual([]);
  expect(tracker.tick(1950 + idleMs)[0].strokes).toHaveLength(4);
});

test('a new line closes the open word', () => {
  const tracker = new WordTracker();
  write(tracker, 0, 3, 0);
  tracker.add(stroke(0, 200, 20, 40), 700);
  expect(tracker.tick(700 + graceMs)[0].strokes).toHaveLength(3);
});

test('an accent written after the word closed, inside the grace time, joins it', () => {
  const tracker = new WordTracker();
  write(tracker, 0, 3, 0);
  tracker.add(letter(140), 700);
  // «café»: the accent over the first word's last letter, 300 ms after the next word began.
  expect(tracker.add(accent(65), 1000)).toEqual([]);
  const [first] = tracker.tick(1000 + graceMs);
  expect(first.strokes).toHaveLength(4);
  expect(first.rect.top).toBe(80);
});

test('an accent after the grace time stays out of the word already handed on', () => {
  const tracker = new WordTracker();
  write(tracker, 0, 3, 0);
  tracker.add(letter(140), 700);
  const [first] = tracker.tick(700 + graceMs);
  expect(first.strokes).toHaveLength(3);
  // Over the handed-on word, with no word left there to join: a stroke of its own.
  tracker.add(accent(65), 700 + graceMs + 10);
  const words = tracker.tick(700 + graceMs + 10 + idleMs);
  expect(words.flatMap(word => word.strokes)).toHaveLength(2);
});

test('an i-dot joins the open word', () => {
  const tracker = new WordTracker();
  write(tracker, 0, 2, 0);
  tracker.add(stroke(35, 85, 4, 4), 300);
  expect(tracker.tick(300 + idleMs)[0].strokes).toHaveLength(3);
});

test('reset hands back every held stroke and starts empty', () => {
  const tracker = new WordTracker();
  write(tracker, 0, 3, 0);
  tracker.add(letter(140), 700);
  expect(tracker.reset()).toHaveLength(4);
  expect(tracker.nextDeadline()).toBeNull();
  expect(tracker.tick(10_000)).toEqual([]);
});

test('Wide spacing keeps a gap together that Normal splits', () => {
  const normal = new WordTracker();
  const wide = new WordTracker({...DEFAULT_WORD_OPTIONS, spacing: 1.4});
  for (const tracker of [normal, wide]) {
    write(tracker, 0, 3, 0);
    tracker.add(letter(120), 700); // gap 40: over 32 (Normal), under 44.8 (Wide)
  }
  expect(normal.tick(700 + graceMs)).toHaveLength(1);
  expect(wide.tick(700 + graceMs)).toHaveLength(0);
});
