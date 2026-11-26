/**
 * The call Collection alone makes (#249): the lassoed elements written as a `.sticker` file. Kept
 * apart from lasso.ts and page.ts, as headings.ts is for Headings.
 */
import {PluginCommAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

/**
 * Writes the lassoed elements to a `.sticker` file at `path` (official docs,
 * «saveStickerByLasso»: strokes and geometries); it wrote one in 39 ms from a lasso row
 * [measured, docs/supernote.md]. `true` means the file was written.
 */
export function saveStickerByLasso(path: string): Promise<Result<boolean>> {
  return attempt(() => PluginCommAPI.saveStickerByLasso(path));
}
