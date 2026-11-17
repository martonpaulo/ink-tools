/**
 * Crop with the pen (#132): the person draws a rectangle with the pen over a picture, lassoes the
 * picture and the rectangle together, and presses Crop. src/guide.ts reads the rectangle from the
 * lasso, deletes it and lassoes the picture alone; `runEdit` then cuts the picture to its box.
 */
import type {Rect} from '@supernote-tools/ink-core';
import {PenPoint} from '@supernote-tools/sn-adapter/official';
import {Box, Done, runEdit, sizeOf} from './edit';
import {GUIDE_DEVICE, GuideDeps, GuideReasons, Guided, runGuided, splitGuides} from './guide';
import {NO_OPTIONS} from './native';

/** Why a Crop press changed nothing; src/press.ts turns each into its toast. */
export const NO_GUIDE = 'the lasso holds no rectangle drawn on the picture';
export const NOT_PICTURE_AND_GUIDE = 'the lasso is not one picture and its rectangle';
export const GUIDE_OUTSIDE = 'the rectangle is not on the picture';

const REASONS: GuideReasons = {none: NO_GUIDE, mixed: NOT_PICTURE_AND_GUIDE};

/**
 * The smallest side of a crop, in page pixels (about 1.4 mm on the Manta): a smaller box is a slip
 * of the pen, not a rectangle.
 */
export const MIN_CROP_PX = 16;

/** The lassoed picture and the rectangle drawn on it, or the reason the lasso is not that. */
export const splitLasso = (elements: object[]): Guided | string =>
  splitGuides(elements, REASONS);

/**
 * The box the guide's points draw, in the picture's pixels from its top left: the lasso preview is
 * the picture at its page size (#130), so a page pixel maps to the picture by its rect's top left.
 * The box is cut to the picture; null when it leaves less than MIN_CROP_PX on a side.
 */
export function cropBox(picture: Rect, points: readonly PenPoint[]): Box | null {
  if (points.length === 0) {
    return null;
  }
  const size = sizeOf(picture);
  const clamp = (value: number, most: number) => Math.min(Math.max(value, 0), most);
  const xs = points.map(point => point.x - picture.left);
  const ys = points.map(point => point.y - picture.top);
  const left = clamp(Math.floor(Math.min(...xs)), size.width);
  const top = clamp(Math.floor(Math.min(...ys)), size.height);
  const right = clamp(Math.ceil(Math.max(...xs)), size.width);
  const bottom = clamp(Math.ceil(Math.max(...ys)), size.height);
  const width = right - left;
  const height = bottom - top;
  return width < MIN_CROP_PX || height < MIN_CROP_PX
    ? null
    : {left, top, width, height};
}

export type CropDeps = GuideDeps & {crop: (box: Box) => Promise<Done>};

const DEVICE: CropDeps = {
  ...GUIDE_DEVICE,
  crop: box => runEdit('crop', undefined, {...NO_OPTIONS, box}),
};

/** Crops the lassoed picture to the rectangle drawn on it, then the guide is gone. */
export function runCrop(deps: CropDeps = DEVICE): Promise<Done> {
  return runGuided(deps, REASONS, guide => {
    const points = guide.strokes.flat();
    const box = cropBox(guide.picture, points);
    deps.log(
      `crop: ${guide.strokes.length} guide strokes, ${points.length} points` +
        ` in ${guide.emr ? 'EMR' : 'page px'}, box ${box ? JSON.stringify(box) : 'none'}`,
    );
    return box ? () => deps.crop(box) : GUIDE_OUTSIDE;
  });
}
