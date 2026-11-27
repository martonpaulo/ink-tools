/**
 * The official tier (#101): every `sn-plugin-lib` call a plugin makes goes through these wrappers,
 * which turn a host answer or a throw into a Result. Ratta changes this API rarely and with notice;
 * the internals tier, which changes without notice, is the package's main entry.
 */
export * from './result';
export * from './actions';
export * from './backKey';
export * from './buttons';
export * from './collection';
export * from './dialog';
export * from './elements';
export * from './file';
export * from './headings';
export * from './image';
export * from './lasso';
export * from './note';
export * from './noteEdit';
export * from './openPage';
export * from './page';
export * from './pen';
export * from './penTape';
export * from './plugin';
export * from './register';
export * from './shapes';
export * from './storage';
