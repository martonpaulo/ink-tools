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
  'settings.loadFailed':
    'Could not read the settings file, so these are the defaults. A change is kept until the tablet restarts.',
  'settings.changeFailed': 'Could not apply or save that change. Try again.',
} as const;
