import {PluginNoteAPI} from 'sn-plugin-lib';
import {attempt, Result} from './result';

/** png, jpg or jpeg only; the host chooses placement and size (brief section 4.4). */
export function insertImage(path: string): Promise<Result<boolean>> {
  return attempt(() => PluginNoteAPI.insertImage(path));
}

/** The text box a plugin inserts: the SDK's `TextBox` fields this repository sets (#115). */
export type TextBoxInput = {
  text: string;
  /** Page pixels, as `PluginFileAPI.getPageSize` measures the page. */
  rect: {left: number; top: number; right: number; bottom: number};
  fontSize: number;
};

/**
 * Inserts a fixed-width, left-aligned, plain text box on the current page; the host's default
 * font. The fields follow sn-plugin-lib 0.2.3's `TextBox` model; on the device it is TO TEST.
 */
export function insertText(box: TextBoxInput): Promise<Result<boolean>> {
  return attempt(() =>
    PluginNoteAPI.insertText({
      fontSize: box.fontSize,
      fontPath: null,
      textContentFull: box.text,
      textRect: box.rect,
      textDigestData: null,
      textAlign: 0,
      textBold: 0,
      textItalics: 0,
      textFrameWidthType: 0,
      textFrameStyle: 0,
      textEditable: 0,
    }),
  );
}
