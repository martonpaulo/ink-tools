/**
 * The entry `@ink-tools/sn-adapter/registry` (#294): the registry of Supernote internals the plugins
 * read, generated from registry/ by scripts/registry.py, without the rest of either tier, and the
 * start-up watch that reads its kill switches (#492).
 */
export * from './src/registry.generated';
export * from './src/firmwareWatch';
