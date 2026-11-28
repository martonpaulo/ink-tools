/** Every user-facing string of Retouch. English only; never inline in components (#93). */
import {closeThen} from '@ink-tools/ui-kit/problem';
export const copy = {
  title: 'Image Editing',
  'settings.edits': 'Editor buttons',
  /** The editor view (#226). */
  'editor.opening': 'Reading the picture…',
  'editor.working': 'Loading…',
  'editor.noPreview': 'Image Editing could not read the lassoed picture.',
  /** Why an edit in the editor found no picture to change (#522); nothing was applied. */
  'editor.gone':
    `The picture was deleted or moved. ${closeThen('lasso it again and press Image Editing.')}`,
  'editor.changed':
    `The note or the page changed. ${closeThen('lasso the picture again and press Image Editing.')}`,
  'editor.inkOnPicture':
    'Ink or shapes lie on this picture, so it cannot be edited alone. Move them off the picture, then press again.',
  'editor.picture': 'The lassoed picture',
  /** A press with no lasso, from the toolbar button (#248): the Needs state. */
  'needs.lasso': 'Lasso a picture first',
  'needs.lassoReason': 'Image Editing edits one picture on the page.',
  'needs.lassoSteps': [
    'Lasso one picture with the lasso tool.',
    'Press Image Editing again.',
  ],
  'editor.edits': 'Edit',
  'editor.pen': 'Draw with the pen',
  'editor.back': 'Go back',
  'editor.page': 'Every picture on the page',
  /** Erase erases each stroke when the pen lifts, and Done keeps them (#278). */
  'editor.drawErase':
    'Draw over the part to erase. It is erased when you lift the pen. Press Done to keep the changes.',
  'editor.drawCrop':
    'Draw a rectangle with the pen around the part to keep, then press Crop.',
  'editor.clear': 'Clear marks',
  'editor.cancel': 'Cancel',
  /** Why the edit and Clear marks wait, next to them (interface rule 16, #233). */
  'editor.noMarks': (edit: string) =>
    `${edit} and Clear marks wait for a mark on the picture.`,
  'editor.done': 'Done',
  'editor.undoStroke': 'Undo stroke',
  /** Why Undo stroke waits in Erase, next to it (interface rule 16, #233). */
  'editor.noStrokes': 'Undo stroke waits for an erased stroke.',
  'editor.strokeOutside':
    'That stroke was not on the picture, so nothing was erased.',
  'editor.strokeFailed':
    'Image Editing could not erase that stroke. Draw it again.',
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
  'permission.files':
    'Image Editing keeps each picture as it was, for Undo and Restore original, in its own folder, which Supernote Cloud does not sync.',
  /** Toasts of a press that changed nothing (#170). */
  'press.permission':
    'Image Editing needs file access. Choose Always Allow for both questions, then press again.',
  'press.notPicture': 'Lasso one picture only, then press again.',
  /** An edit that reached the image step without its input (#295). */
  'edit.cropNoBox': 'Crop has no box',
  'edit.eraseNoMarks': 'Erase has no marks',
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
  /** The Error state of a press that failed on the tablet (#256); the details go to the log. */
  'press.failedTitle': (edit: string) => `${edit} did not work`,
  'page.failedTitle': 'The page could not be read',
  'press.failedReason': closeThen('press the edit again.'),
  /** The toast of a page-wide press (#140). */
  'page.done': (edited: number, pictures: number) =>
    pictures === 0
      ? 'There is no picture on this page.'
      : `${edited} of ${pictures} pictures changed.`,
  'page.failed': (why: string) => `The page could not be read: ${why}`,
  /** Toasts that replace the «Loading…» strip (#103). */
  'working.failed': 'Image Editing stopped with an error.',
  'working.timeout': 'Image Editing is still working.',
  /** The debug switch of Settings (#134). */
  'settings.debug': 'Debug',
  'settings.debugSave': 'Save edit input',
} as const;
