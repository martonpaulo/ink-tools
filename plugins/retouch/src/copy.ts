/** Every user-facing string of Retouch. English only; never inline in components (#93). */
export const copy = {
  title: 'Image Editing',
  'settings.edits': 'Lasso buttons',
  'edit.enhance': 'Enhance',
  'edit.lighter': 'Lighter',
  'edit.darker': 'Darker',
  'edit.undo': 'Undo',
  'edit.restore': 'Restore original',
  'edit.rotate': 'Rotate 90°',
  'edit.mirror': 'Mirror',
  'edit.flip': 'Flip',
  'edit.invert': 'Invert',
  'edit.trim': 'Trim',
  'edit.background': 'Remove background',
  'edit.sticker': 'Make sticker',
  'edit.document': 'Document',
  'edit.styles': 'Styles',
  'edit.enhance_all': 'Enhance All Images',
  'edit.undo_all': 'Undo All Images',
  'edit.crop': 'Crop',
  'edit.erase': 'Erase',
  'settings.styles': 'Styles',
  'style.photo': 'Photo',
  'style.line_art': 'Line art',
  'style.black_white': 'Black and white',
  'style.dither': 'Dither',
  'style.atkinson': 'Clean dither',
  'styles.transparent': 'White to transparent',
  'styles.thick': 'Thicker lines',
  'styles.making': 'Making the styles…',
  'styles.failed': 'Could not make the styles',
  'styles.close': 'Close',
  'permission.files':
    'Image Editing keeps each picture as it was, for Undo and Restore original, in its own folder, which Supernote Cloud does not sync.',
  /** Toasts of a press that changed nothing (#170). */
  'press.permission':
    'Image Editing needs file access. Choose Always Allow for both questions, then press again.',
  'press.notPicture': 'Lasso one picture only, then press again.',
  'press.notEdited': 'Image Editing has not changed this picture yet.',
  /** Crop's toasts (#132): what to draw and lasso. */
  'press.cropNoGuide':
    'Draw a rectangle on the picture with the pen, lasso the picture and the rectangle, then press Crop.',
  'press.cropNotPicture':
    'Lasso one picture and the rectangle drawn on it, then press Crop.',
  'press.cropOutside':
    'Draw a larger rectangle on the picture itself, then press Crop again.',
  /** Erase's toasts (#134): what to draw and lasso. */
  'press.eraseNoMarks':
    'Draw over the part to erase with the pen, lasso the picture and your marks, then press Erase.',
  'press.eraseNotPicture':
    'Lasso one picture and the marks drawn on it, then press Erase.',
  'press.eraseOutside':
    'Draw the marks on the picture itself, then press Erase again.',
  'press.failed': (edit: string, why: string) => `${edit} did not work: ${why}`,
  /** The toast of a page-wide press (#140). */
  'page.done': (edited: number, pictures: number) =>
    pictures === 0
      ? 'There is no picture on this page.'
      : `${edited} of ${pictures} pictures changed.`,
  'page.failed': (why: string) => `The page could not be read: ${why}`,
  /** Toasts that replace the «Loading…» strip (#103). */
  'working.failed': 'Image Editing stopped with an error.',
  'working.timeout': 'Image Editing is still working.',
} as const;
