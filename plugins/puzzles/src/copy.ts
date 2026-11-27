import {PERMISSION_FILE_READ, PERMISSION_FILE_WRITE} from '@ink-tools/sn-adapter/official';

/** Puzzles' own strings; each game keeps its own beside its view. English only (#93). */
export const copy = {
  title: 'Puzzles',
  'games.caption': 'Games',
  'games.none': 'No games yet. A newer version of Puzzles adds them.',
  /** Each permission by the name the tablet's Settings shows (#453). */
  permissionNames: {
    [PERMISSION_FILE_READ]: 'File read',
    [PERMISSION_FILE_WRITE]: 'File write',
  } as Record<string, string>,
  /** The Needs state while a declared permission is not granted (#245, #453). */
  needsPermission: (names: string) => `Puzzles needs ${names}`,
  'needs.files':
    'Puzzles reads and writes files to put each game on a new page of your note.',
  'needs.allow': 'Allow',
  /** The Needs state after the host refused: only the person can allow it now. */
  refusedSteps: (names: string) => [
    'Open Settings > Apps > Plugins > Puzzles.',
    `Allow ${names}.`,
    'Open the game again.',
  ],
  /** The Error state when the permission check itself fails: its cause is not known. */
  'error.check': 'Puzzles could not check its permissions.',
  'error.checkHint':
    'Press Retry. If it fails again, close Puzzles and press its button in the note again.',
} as const;
