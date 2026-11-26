/** Lasso Actions' built modules (#306), apart from their table (src/modules.ts) so the settings file reads them with no cycle. */
export const MODULE_IDS = ['lookup'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
