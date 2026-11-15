/**
 * Lookup reaches Ink2Pic's picture search through the shared package (#125): the name resolves in
 * Jest, tsc and Metro, and the source registry it ships is the one Ink2Pic uses.
 */
import {DEFAULT_ADAPTERS, PAGE_SIZE} from '@supernote-tools/picture-search';

test('the picture search package resolves from Lookup', () => {
  expect(DEFAULT_ADAPTERS.length).toBeGreaterThan(0);
  expect(DEFAULT_ADAPTERS.map(adapter => adapter.name)).toContain('openmoji');
  expect(PAGE_SIZE).toBeGreaterThan(0);
});
