/**
 * The internals tier (#101): content providers and their tables, found by reverse engineering, which
 * any firmware update can change. The official `sn-plugin-lib` tier is the separate entry
 * `@supernote-tools/sn-adapter/official`, so code that needs only one tier never loads the other.
 */
export * from './internals';
