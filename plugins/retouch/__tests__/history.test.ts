import {
  EMPTY,
  findEntry,
  MAX_PICTURES,
  MAX_STATES,
  parseHistory,
  Place,
  placeAt,
  recordEdit,
  restoreStep,
  undoStep,
} from '../src/history';

const RECT = {left: 100, top: 200, right: 500, bottom: 500};
const PLACE: Place = {note: '/Note/a.note', page: 0, rect: RECT};
const state = (path: string, width = 400, height = 300) => ({path, width, height});

test('a missing file is an empty history and a broken one is refused', () => {
  expect(parseHistory(null)).toEqual(EMPTY);
  expect(parseHistory('not json')).toBeNull();
  expect(parseHistory('{"version":2,"entries":[]}')).toBeNull();
  const kept = recordEdit(EMPTY, PLACE, RECT, state('e'), state('o'), 1).history;
  expect(parseHistory(JSON.stringify(kept))).toEqual(kept);
});

test('the first edit keeps the original, and the same picture is found again', () => {
  const {history, drop} = recordEdit(EMPTY, PLACE, RECT, state('e1'), state('o'), 1);
  expect(drop).toEqual([]);
  expect(findEntry(history, PLACE)?.states.map(s => s.path)).toEqual(['o', 'e1']);
  // The host may round the rect by a pixel.
  const moved = {...PLACE, rect: {...RECT, left: 101, bottom: 499}};
  expect(findEntry(history, moved)).not.toBeNull();
  expect(findEntry(history, {...PLACE, page: 1})).toBeNull();
  expect(() => recordEdit(EMPTY, PLACE, RECT, state('e'), null, 1)).toThrow();
});

test('the states stop at the cap and always keep the original', () => {
  let history = recordEdit(EMPTY, PLACE, RECT, state('e1'), state('o'), 1).history;
  const dropped: string[] = [];
  for (let i = 2; i <= MAX_STATES + 2; i++) {
    const change = recordEdit(history, PLACE, RECT, state(`e${i}`), null, i);
    history = change.history;
    dropped.push(...change.drop);
  }
  const states = findEntry(history, PLACE)!.states;
  expect(states).toHaveLength(MAX_STATES);
  expect(states[0].path).toBe('o');
  expect(dropped).toEqual(['e1', 'e2', 'e3']);
});

test('the picture edited longest ago goes first, with its files', () => {
  let history = EMPTY;
  for (let i = 0; i <= MAX_PICTURES; i++) {
    const place = {...PLACE, page: i};
    const change = recordEdit(history, place, RECT, state(`e${i}`), state(`o${i}`), i);
    history = change.history;
    if (i === MAX_PICTURES) {
      expect(change.drop).toEqual(['o0', 'e0']);
    }
  }
  expect(history.entries).toHaveLength(MAX_PICTURES);
});

test('Undo steps back one state, and back at the original drops everything', () => {
  let history = recordEdit(EMPTY, PLACE, RECT, state('e1'), state('o'), 1).history;
  history = recordEdit(history, PLACE, RECT, state('e2'), null, 2).history;
  const first = undoStep(history, PLACE)!;
  expect(first.show.path).toBe('e1');
  const after = first.after(RECT, 3);
  expect(after.drop).toEqual(['e2']);
  const second = undoStep(after.history, PLACE)!;
  expect(second.show.path).toBe('o');
  const end = second.after(RECT, 4);
  expect(end.drop).toEqual(['o', 'e1']);
  expect(end.history.entries).toEqual([]);
  expect(undoStep(end.history, PLACE)).toBeNull();
});

test('Restore original shows the first state and drops every file', () => {
  let history = recordEdit(EMPTY, PLACE, RECT, state('e1'), state('o'), 1).history;
  history = recordEdit(history, PLACE, RECT, state('e2'), null, 2).history;
  const step = restoreStep(history, PLACE)!;
  expect(step.show.path).toBe('o');
  expect(step.after(RECT, 3)).toEqual({
    history: EMPTY,
    drop: ['o', 'e1', 'e2'],
  });
  expect(restoreStep(EMPTY, PLACE)).toBeNull();
});

test('a picture keeps its corner and stays inside the page', () => {
  expect(placeAt(RECT, {width: 200, height: 100}, 1920)).toEqual({
    left: 100,
    top: 200,
    right: 300,
    bottom: 300,
  });
  expect(placeAt({...RECT, left: 900}, {width: 1920, height: 50}, 1920)).toEqual({
    left: 0,
    top: 200,
    right: 1920,
    bottom: 250,
  });
});
