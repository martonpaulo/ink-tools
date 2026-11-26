import {IMPLEMENTATION, ModuleOff, port, REGISTRY_ITEMS, registryItem, RegistryItem} from '../src';

/** A port picks the implementation the registry names and checks the kill switch first (#293, #294). */
const item = (fields: Partial<RegistryItem>): RegistryItem => ({...registryItem('todo.provider'), ...fields});

describe('port', () => {
  const calls: string[] = [];
  const level2 = {read: (key: string) => {calls.push(`2 ${key}`); return 2;}};
  const level1 = {read: (key: string) => {calls.push(`1 ${key}`); return 1;}};
  beforeEach(() => {calls.length = 0;});

  it('runs the implementation the item names as active', () => {
    const items = [item({active: 'level two'})];
    expect(port('todo.provider', {'level one': level1, 'level two': level2}, items).read('a')).toBe(2);
    const moved = [item({active: 'level one'})];
    expect(port('todo.provider', {'level one': level1, 'level two': level2}, moved).read('b')).toBe(1);
    expect(calls).toEqual(['2 a', '1 b']);
  });

  it('refuses an item with no implementation of its active name, and takes no other', () => {
    expect(() => port('todo.provider', {'level one': level1}, [item({active: 'level two'})])).toThrow(
      'no implementation of todo.provider for its active level two',
    );
  });

  it('stops every operation of an item whose kill switch is off, before it runs', () => {
    const items = [item({active: 'level two', off: 'until 2026-12-31: the provider changed'})];
    const off = port('todo.provider', {'level two': level2}, items);
    expect(() => off.read('a')).toThrow(ModuleOff);
    expect(() => off.read('a')).toThrow('todo.provider is turned off until 2026-12-31: the provider changed; read did not run');
    expect(calls).toEqual([]);
  });

  it('names only implementations the registry holds as active', () => {
    const active = new Set(REGISTRY_ITEMS.map(entry => entry.active));
    expect(Object.values(IMPLEMENTATION).filter(name => !active.has(name))).toEqual([]);
  });
});
