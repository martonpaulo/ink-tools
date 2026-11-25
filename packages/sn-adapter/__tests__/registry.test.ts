import {BUNDLED_DESCRIPTOR as D, REGISTRY, REGISTRY_ITEMS, contentUri} from '../src';

/** The generated registry reader loads and agrees with the descriptor written from the same data (#294). */
describe('registry reader', () => {
  it('lists each item once with a level and a probe or an unprobed reason', () => {
    const ids = REGISTRY_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of REGISTRY_ITEMS) {
      expect(item.level).toBeGreaterThanOrEqual(1);
      expect(item.level).toBeLessThanOrEqual(5);
      expect((item.probe === null) !== (item.unprobed === null)).toBe(true);
    }
  });

  it('derives each provider URI from the descriptor', () => {
    expect(REGISTRY.todoProvider.tasksUri).toBe(contentUri(D.todo, 'tasks'));
    expect(REGISTRY.calendarProvider.eventsUri).toBe(contentUri(D.calendar, 'events'));
    expect(REGISTRY.digestProvider.authority).toBe(D.digest.authority);
  });
});
