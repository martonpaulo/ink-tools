/**
 * The internals tier (#101): content providers and their tables, learned from observed device behaviour,
 * which any firmware update can change. The official `sn-plugin-lib` tier is the separate entry
 * `@ink-tools/sn-adapter/official`, so code that needs only one tier never loads the other.
 */
export * from './internals';
export * from './registry.generated';
export * from './failure';
export * from './port';
export * from './firmwareWatch';
