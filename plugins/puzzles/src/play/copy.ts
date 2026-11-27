/** The strings every game view shares (#386); each game keeps its own beside it. English only (#93). */
export const playCopy = {
  difficulty: 'Difficulty',
  bands: {easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert'} as Record<string, string>,
  'new.caption': 'New page',
  'new.add': 'Add Page',
  'new.note': 'The puzzle goes on a new page after this one, as its background, so erasing never erases the grid.',
  'here.caption': 'This page',
  'here.check': 'Check',
  'here.answer': 'Show Solution',
  /** The titles of the two pictures the view shows. */
  'verdict.title': 'Checked Page',
  'answer.title': 'Solution',
  'here.none': (game: string) => `This page has no ${game}. Open a ${game} page to check it or see its solution.`,
  /** The row of the page's puzzle: its game and difficulty, then its code. */
  'here.title': (game: string, band: string) => `${game}, ${band}`,
  /** After a new page went in. */
  'added.title': 'Page added',
  'added.note': (game: string) => `The ${game} is on the next page. Close Puzzles and turn the page to solve it.`,
  'verdict.solved': 'Solved. Nothing is wrong.',
  'verdict.open': 'Nothing is wrong so far.',
  'verdict.wrong': (count: number) => (count === 1 ? '1 mistake is circled.' : `${count} mistakes are circled.`),
  'answer.note': 'Only Puzzles shows the solution. Your note does not change.',
  /** The Error states of a game view. */
  'error.here': 'Puzzles could not read this page.',
  'error.add': 'Puzzles could not add the page.',
  'error.check': 'Puzzles could not check this page.',
  'error.hereHint': 'Make sure a note is open, then press Retry.',
  'error.hint': 'Press Retry. If it fails again, close Puzzles and open it again.',
} as const;
