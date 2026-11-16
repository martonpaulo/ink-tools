/**
 * The official tier (#101): every `sn-plugin-lib` call a plugin makes goes through these wrappers,
 * which turn a host answer or a throw into a Result. Ratta changes this API rarely and with notice;
 * the internals tier, which changes without notice, is the package's main entry.
 */
export * from './result';
export * from './buttons';
export * from './file';
export * from './image';
export * from './lasso';
export * from './note';
export * from './page';
export * from './pen';
export * from './plugin';
export * from './register';
export * from './storage';
