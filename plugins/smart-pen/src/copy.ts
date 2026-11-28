/** Smart Pen's own strings; each module keeps its own in its folder. English only (#93). */
export const copy = {
  title: 'Smart Pen',
  'settings.modules': 'Modules',
  'module.text': 'Real-Time Text',
  'module.textNote':
    'Turns each handwritten word into typed text while the sidebar button «Real-Time Text» is on.',
  'module.shapes': 'Smart Shapes',
  'module.shapesNote':
    'Draw a shape and hold the pen still at the end: it becomes a clean shape.',
  'module.gestures': 'Gestures',
  'module.gesturesNote':
    'Tap the page with a finger to pick a pen, an eraser or the lasso, such as a double tap for pen 1.',
  'settings.loadFailed':
    'Could not read the settings file, so these are the defaults. A change is kept until the tablet restarts.',
  'settings.changeFailed': 'Could not apply or save that change. Try again.',
  /** The «Loading…» view's lines (#103, #257): what failed and the timeout's toast. */
  'working.failed': 'Smart Pen stopped with an error.',
  'working.timeout': 'Smart Pen is still working.',
} as const;
