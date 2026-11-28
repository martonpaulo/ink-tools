/**
 * The Gestures module's settings (#270): which action each finger gesture runs. Defaults: a double
 * tap picks pen 1 and a triple tap eraser 1; the other gestures do nothing until mapped.
 */
export const GESTURES = [
  'doubleTap',
  'tripleTap',
  'twoFingerTap',
  'threeFingerTap',
] as const;
export type Gesture = (typeof GESTURES)[number];

export const TOOL_ACTIONS = [
  'pen1',
  'pen2',
  'pen3',
  'eraser1',
  'eraser2',
  'lasso',
  'undo',
  'redo',
  'none',
] as const;
export type ToolAction = (typeof TOOL_ACTIONS)[number];

/**
 * The content description of NOTE's toolbar button each action presses, which Handwriting
 * Language's `WritingWatcher` finds the node by. `pen_1` to `pen_3`, `eraser_1`, `eraser_3`, `lasso`
 * and `undo` were read from the toolbar [measured, #251]; the second eraser is `eraser_3` there.
 * shortcut: `redo` is not measured; the device round of #270 reads it and fixes this value.
 */
export const TOOLBAR_BUTTON: Record<Exclude<ToolAction, 'none'>, string> = {
  pen1: 'pen_1',
  pen2: 'pen_2',
  pen3: 'pen_3',
  eraser1: 'eraser_1',
  eraser2: 'eraser_3',
  lasso: 'lasso',
  undo: 'undo',
  redo: 'redo',
};

export type Settings = Record<Gesture, ToolAction>;

export const DEFAULT_SETTINGS: Settings = {
  doubleTap: 'pen1',
  tripleTap: 'eraser1',
  twoFingerTap: 'none',
  threeFingerTap: 'none',
};

let current: Settings = DEFAULT_SETTINGS;

export function getSettings(): Settings {
  return current;
}

export function setSettings(next: Settings): void {
  current = next;
}
