import raw from './descriptor.json';

export type Capability = 'calendar' | 'todo' | 'digest';

export interface TableDescriptor {
  path: string;
  /** Columns the table must expose. Empty means "the table only has to answer". */
  columns: string[];
}

export interface ModuleDescriptor {
  authority: string;
  tables: Record<string, TableDescriptor>;
  rules: Record<string, unknown>;
  permissions?: {read: string; write: string};
}

export interface Descriptor {
  schema: number;
  descriptorVersion: string;
  calendar: ModuleDescriptor;
  todo: ModuleDescriptor;
  digest: ModuleDescriptor;
}

export const SUPPORTED_SCHEMA = 1;

/** The descriptor shipped with the package. A newer one can replace it without a plugin release. */
export const BUNDLED_DESCRIPTOR = raw as unknown as Descriptor;

/** Validate a descriptor loaded from outside (an update). Throws with the first problem found. */
export function parseDescriptor(value: unknown): Descriptor {
  const d = value as Descriptor;
  if (!d || typeof d !== 'object') throw new Error('descriptor is not an object');
  if (d.schema !== SUPPORTED_SCHEMA) {
    throw new Error(`descriptor schema ${String(d.schema)} is not supported (expected ${SUPPORTED_SCHEMA})`);
  }
  for (const cap of ['calendar', 'todo', 'digest'] as const) {
    const m = d[cap];
    if (!m || typeof m.authority !== 'string' || !m.authority) throw new Error(`${cap}: missing authority`);
    if (!m.tables || !Object.keys(m.tables).length) throw new Error(`${cap}: no tables`);
    for (const [name, t] of Object.entries(m.tables)) {
      if (typeof t.path !== 'string' || !Array.isArray(t.columns)) throw new Error(`${cap}.${name}: bad table`);
    }
  }
  return d;
}

export function contentUri(m: ModuleDescriptor, table: string): string {
  const t = m.tables[table];
  if (!t) throw new Error(`unknown table ${table}`);
  return `content://${m.authority}/${t.path}`;
}
