/** The settings' defaults have one owner and stay inside the choices the view offers (#253). */
import {
  DEFAULT_SETTINGS,
  MIN_SIZE_CHOICES_MM,
  minSizePx,
  PX_PER_MM,
} from '../src/settings';

test('the default minimum size is one of the choices, about two handwriting lines', () => {
  expect(MIN_SIZE_CHOICES_MM).toContain(DEFAULT_SETTINGS.minSizeMm);
  expect(minSizePx(DEFAULT_SETTINGS)).toBeCloseTo(16 * PX_PER_MM);
});

test('every shape starts on, and the feature starts on', () => {
  expect(DEFAULT_SETTINGS.on).toBe(true);
  expect(Object.values(DEFAULT_SETTINGS.shapes)).toEqual([
    true,
    true,
    true,
    true,
    true,
  ]);
});
