/**
 * Erase with the pen (#134): the person draws with the pen over the part of a picture to remove,
 * lassoes the picture and the marks together, and presses Erase. src/guide.ts reads the marks from
 * the lasso [measured, #132], deletes them and lassoes the picture alone; the Java side then clears
 * a band along each mark, and the inside of a mark that closes on itself, to transparent.
 * No plugin view takes the pen: whether one can is not measured yet (#134).
 */
import type {Rect} from '@supernote-tools/ink-core';
import {PenPoint} from '@supernote-tools/sn-adapter/official';
import {Done, Marks, runEdit} from './edit';
import {GUIDE_DEVICE, GuideDeps, GuideReasons, runGuided} from './guide';
import {NO_OPTIONS} from './native';

/** Why an Erase press changed nothing; src/press.ts turns each into its toast. */
export const NO_MARKS = 'the lasso holds no pen marks on the picture';
export const NOT_PICTURE_AND_MARKS = 'the lasso is not one picture and the pen marks on it';
export const MARKS_OUTSIDE = 'the pen marks are not on the picture';

const REASONS: GuideReasons = {none: NO_MARKS, mixed: NOT_PICTURE_AND_MARKS};

/** The marks of `strokes` on `picture`, or null when no point lies on the picture. */
export function eraseMarks(picture: Rect, strokes: readonly PenPoint[][]): Marks | null {
  const points: number[] = [];
  const ends: number[] = [];
  let onPicture = false;
  for (const stroke of strokes) {
    if (stroke.length === 0) {
      continue;
    }
    for (const point of stroke) {
      onPicture =
        onPicture ||
        (point.x >= picture.left &&
          point.x <= picture.right &&
          point.y >= picture.top &&
          point.y <= picture.bottom);
      points.push(point.x - picture.left, point.y - picture.top);
    }
    ends.push(points.length / 2);
  }
  return onPicture ? {points, ends} : null;
}

export type EraseDeps = GuideDeps & {erase: (marks: Marks) => Promise<Done>};

const DEVICE: EraseDeps = {
  ...GUIDE_DEVICE,
  erase: marks => runEdit('erase', undefined, {...NO_OPTIONS, marks}),
};

/** Erases what the pen marked on the lassoed picture, then the marks are gone. */
export function runErase(deps: EraseDeps = DEVICE): Promise<Done> {
  return runGuided(deps, REASONS, guide => {
    const marks = eraseMarks(guide.picture, guide.strokes);
    deps.log(
      `erase: ${guide.strokes.length} marks, ${marks ? marks.points.length / 2 : 0} points` +
        ` in ${guide.emr ? 'EMR' : 'page px'}${marks ? '' : ', none on the picture'}`,
    );
    return marks ? () => deps.erase(marks) : MARKS_OUTSIDE;
  });
}
