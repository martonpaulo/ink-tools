/** The strings every game view shares (#386); each game keeps its own beside it. English only (#93). */
export const playCopy = {
  /**
   * The choices' titles say they are the new page's, so «Size» and «Difficulty» beside «This page» never
   * read as describing the page on screen, whose row names its own size and band (#545).
   */
  difficulty: 'New page difficulty',
  /** A game of several grid sizes: the choice's title and each size's label. */
  size: 'New page size',
  sizeLabel: (size: number) => playCopy.gridLabel(size, size),
  /** A grid's columns and rows, for a puzzle whose page names both. */
  gridLabel: (width: number, height: number) => `${width} x ${height}`,
  bands: {easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert'} as Record<string, string>,
  'new.caption': 'New page',
  'new.add': 'Add Page',
  'new.note': 'The puzzle goes on a new page after this one, as its background, so erasing never erases the grid.',
  'new.noteBoard': 'The board goes on a new page after this one, as its background, so erasing never erases the board.',
  'here.caption': 'This page',
  'here.check': 'Check',
  'here.answer': 'Show Solution',
  /** The wait while a press makes the page's puzzle again from its code, seconds for a large one on the tablet (#595). */
  'here.preparing': 'Preparing the puzzle…',
  /** The titles of the two pictures the view shows. */
  'verdict.title': 'Checked Page',
  'answer.title': 'Solution',
  'here.newer': 'A newer Puzzles made this page. Update Puzzles to check it or see its solution.',
  'here.none': (game: string) => `This page has no ${game}. Open a ${game} page to check it or see its solution.`,
  /** The row of the page's puzzle: its game, its size when the game offers sizes (#545), its difficulty; then its code. */
  'here.title': (game: string, band: string, size?: string) => (size === undefined ? `${game}, ${band}` : `${game}, ${size}, ${band}`),
  'verdict.solved': 'Solved. Nothing is wrong.',
  'verdict.open': 'Nothing is wrong so far.',
  'verdict.wrong': (count: number) => (count === 1 ? '1 mistake is circled.' : `${count} mistakes are circled.`),
  /** Added after the verdict when some entries could not be read. */
  'verdict.unread': (count: number) =>
    count === 1
      ? 'Puzzles could not read 1 entry, which has a dashed circle. Write it again, go back, then press Check.'
      : `Puzzles could not read ${count} entries, which have dashed circles. Write them again, go back, then press Check.`,
  /**
   * The unread note of a game answered with a shade, a dot or a cross (#384): it says how to mark, as
   * «Write it again» cannot. All the ink in a cell is read together, so the old mark is erased first.
   */
  'verdict.unreadMark': (count: number) =>
    count === 1
      ? 'Puzzles could not read 1 cell, which has a dashed circle. Erase it, then shade it fully or put a dot or a cross in it. Then go back and press Check.'
      : `Puzzles could not read ${count} cells, which have dashed circles. Erase them, then shade each fully or put a dot or a cross in it. Then go back and press Check.`,
  /** The notes of a game whose «Check» frames a cell instead of circling it, as its own marks are rings (#393). */
  'verdict.wrongFramed': (count: number) => (count === 1 ? '1 mistake has a square around it.' : `${count} mistakes have squares around them.`),
  'verdict.unreadFramed': (count: number) =>
    count === 1
      ? 'Puzzles could not read 1 cell, which has a dashed square. Erase it, then shade it fully or put a dot or a cross in it. Then go back and press Check.'
      : `Puzzles could not read ${count} cells, which have dashed squares. Erase them, then shade each fully or put a dot or a cross in it. Then go back and press Check.`,
  'answer.note': 'Only Puzzles shows the solution. Your note does not change.',
  /** The Error states of a game view. */
  'error.here': 'Puzzles could not read this page.',
  'error.add': 'Puzzles could not add the page.',
  'error.check': 'Puzzles could not check this page.',
  'error.make': 'Puzzles could not set up the puzzle on this page.',
  'error.makeHint': 'Press Retry. If it fails again, add a new page of this game.',
  'error.hereHint': 'Make sure a note is open, then press Retry.',
  'error.hint': 'Press Retry. If it fails again, close Puzzles and open it again.',
} as const;
