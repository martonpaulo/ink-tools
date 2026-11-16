/**
 * «Insert Sticker» (#35, owner D32 A): the prepared picture becomes a Supernote sticker through
 * the SDK's own calls, a picture element written as a `.sticker` file by `convertElement2Sticker`,
 * then pasted by `insertSticker`, so the sticker can be used again. The host places it, as its own
 * Sticker plugin does (docs/supernote.md), so there is no rect to lasso.
 * shortcut: the `.sticker` file is kept beside the picture, in the plugin's pictures folder;
 * whether `insertSticker` also files it in the device's sticker library is the device check of
 * #35, and the path moves there once the folder is known.
 */
import {log, logged} from '../log/memory';
import {
  convertElement2Sticker,
  createElement,
  fail,
  getDeviceType,
  insertSticker,
  ok,
  PICTURE_TYPE,
  Result,
  THROWN_CODE,
} from '@supernote-tools/sn-adapter/official';

/** The `.sticker` file beside a prepared picture: `apple.png` gives `apple.sticker`. */
export function stickerPath(picturePath: string): string {
  return `${picturePath.replace(/\.[^./]+$/, '')}.sticker`;
}

/** Inserts the prepared picture as a sticker; the host places it, so the value is null. */
export async function insertAsSticker(
  picturePath: string,
  size: {width: number; height: number},
): Promise<Result<null>> {
  const machine = await logged('getDeviceType', getDeviceType);
  if (!machine.ok) {
    return machine;
  }
  const created = await logged('createElement(picture)', () =>
    createElement(PICTURE_TYPE),
  );
  if (!created.ok) {
    return created;
  }
  const element = {
    ...created.value,
    type: PICTURE_TYPE,
    layerNum: 0,
    picture: {
      picturePath,
      rect: {left: 0, top: 0, right: size.width, bottom: size.height},
    },
  };
  const path = stickerPath(picturePath);
  const converted = await logged(`convertElement2Sticker(${path})`, () =>
    convertElement2Sticker(machine.value, [element], path),
  );
  if (!converted.ok) {
    return converted;
  }
  if (converted.value !== true) {
    return fail(THROWN_CODE, 'convertElement2Sticker answered false');
  }
  const inserted = await logged(`insertSticker(${path})`, () =>
    insertSticker(path),
  );
  if (!inserted.ok) {
    return inserted;
  }
  if (inserted.value !== true) {
    return fail(THROWN_CODE, 'insertSticker answered false');
  }
  log(`sticker: ${path} pasted`);
  return ok(null);
}
