/**
 * Lookup reaches the picture search through the shared package (#125): the name resolves in Jest,
 * tsc and Metro, and it ships the package's source registry.
 */
import {DEFAULT_ADAPTERS, PAGE_SIZE} from '@ink-tools/picture-search';

test('the picture search package resolves from Lookup', () => {
  expect(DEFAULT_ADAPTERS.length).toBeGreaterThan(0);
  expect(DEFAULT_ADAPTERS.map(adapter => adapter.name)).toContain('openmoji');
  expect(PAGE_SIZE).toBeGreaterThan(0);
});
