/**
 * Placement at the lassoed word (brief section 8.3, #20, #39, #70; spike S5): ink-core's
 * placeAtLasso (#109) over this plugin's SDK wrappers and log. When it fails, the caller falls
 * back to insertImage and the host's placement.
 */
import {
  placeAtLasso as placeWith,
  type LassoPlace,
  type PlaceHost,
  type Placement,
  type Rect,
} from '@supernote-tools/ink-core';
import {logged} from '../profile';
import {
  createElement,
  insertPageElements,
  PICTURE_TYPE,
  CallFailure,
  fail,
  Result,
  THROWN_CODE,
} from '@supernote-tools/sn-adapter/official';

export type {LassoPlace, Placement};

const host: PlaceHost<CallFailure> = {
  pictureType: PICTURE_TYPE,
  createElement,
  insertPageElements,
  failure: message => fail(THROWN_CODE, message),
  logged: (label, call) => logged(label, call),
};

/** Inserts the picture beside the lasso; its value is the rect the picture was placed at (#73). */
export function placeAtLasso(
  path: string,
  picture: {width: number; height: number},
  place: LassoPlace,
  placement: Placement = 'below',
): Promise<Result<Rect>> {
  return placeWith(host, path, picture, place, placement);
}
