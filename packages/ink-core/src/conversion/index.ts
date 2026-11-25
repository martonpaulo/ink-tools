/**
 * The handwriting-to-text engine (#305): the word rule, the shape filter, the conversion of each
 * finished word into a text box, and «Undo Conversion». Smart Pen's Real-Time Text runs it, and
 * Lasso Actions' «Convert to Text» shares its sizes and its undo record (#306). A separate entry,
 * `@ink-tools/ink-core/conversion`, so a plugin without it never bundles it, and its names never
 * meet the rest of ink-core's.
 */
export * from './convert';
export * from './shapes';
export * from './undo';
export * from './words';
