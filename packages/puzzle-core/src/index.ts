/**
 * The Puzzles core (#380): seeded generators with one solution and a difficulty rating, shared by
 * the Puzzles plugin and, later, the Ink Notebook Editor. Pure TypeScript: no React Native, no
 * device call, no network.
 */
export * from './code';
export { createRandom, childSeed, digest, type Random } from './random';
export { searchExactCover, type ExactCoverProblem, type ExactCoverResult } from './exact-cover';
export * from './sudoku-techniques';
export * from './sudoku';
export * from './jigsaw';
export * from './jigsaw-page';
export * from './sudoku-game';
export * from './nonogram';
export * from './nonogram-page';
export * from './maze';
export * from './word-search';
export * from './slitherlink';
export * from './slitherlink-page';
export * from './games/word-search';
export * from './futoshiki';
export * from './futoshiki-page';
export * from './codeword';
export * from './calcudoku';
export * from './calcudoku-page';
export * from './light-up';
export * from './hitori';
export * from './page';
export * from './check';
export * from './maze-page';
export * from './fill-in';
export * from './fill-in-page';
