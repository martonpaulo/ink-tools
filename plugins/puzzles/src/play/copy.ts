/** The strings every game view shares (#386); each game keeps its own beside it. English only (#93). */
export const playCopy = {
  difficulty: 'Difficulty',
  /** A game of several grid sizes: the choice's title and each size's label. */
  size: 'Size',
  sizeLabel: (size: number) => `${size} x ${size}`,
  bands: {easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert'} as Record<string, string>,
  'new.caption': 'New page',
  'new.add': 'Add Page',
  'new.note': 'The puzzle goes on a new page after this one, as its background, so erasing never erases the grid.',
  'new.noteBoard': 'The board goes on a new page after this one, as its background, so erasing never erases the board.',
  'here.caption': 'This page',
  'here.check': 'Check',
  'here.answer': 'Show Solution',
  /** The titles of the two pictures the view shows. */
  'verdict.title': 'Checked Page',
  'answer.title': 'Solution',
  'here.none': (game: string) => `This page has no ${game}. Open a ${game} page to check it or see its solution.`,
  /** The row of the page's puzzle: its game and difficulty, then its code. */
  'here.title': (game: string, band: string) => `${game}, ${band}`,
  'verdict.solved': 'Solved. Nothing is wrong.',
  'verdict.open': 'Nothing is wrong so far.',
  'verdict.wrong': (count: number) => (count === 1 ? '1 mistake is circled.' : `${count} mistakes are circled.`),
  /** Added after the verdict when some entries could not be read. */
  'verdict.unread': (count: number) =>
    count === 1
      ? 'Puzzles could not read 1 entry, which has a dashed circle. Write it again, then press Check.'
      : `Puzzles could not read ${count} entries, which have dashed circles. Write them again, then press Check.`,
  'answer.note': 'Only Puzzles shows the solution. Your note does not change.',
  /** The Error states of a game view. */
  'error.here': 'Puzzles could not read this page.',
  'error.add': 'Puzzles could not add the page.',
  'error.check': 'Puzzles could not check this page.',
  'error.hereHint': 'Make sure a note is open, then press Retry.',
  'error.hint': 'Press Retry. If it fails again, close Puzzles and open it again.',
} as const;
