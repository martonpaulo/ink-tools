/**
 * The name of each level's implementation of a port, as a registry item's `active` field gives it
 * (#294, docs/architecture.md › Layer rules). A port picks its implementation by this name; a part
 * moved to a higher level adds its name here and the item's `active` changes, never a tool.
 */
export const IMPLEMENTATION = {
  /** Level 2: the Calendar provider's rows, read and written through this package's mappers. */
  calendarRows: 'sn-adapter internals/calendar.ts',
  /** Level 2: the To-Do provider's rows. */
  todoRows: 'sn-adapter internals/todo.ts',
  /** Level 2: the Digest provider's rows. */
  digestRows: 'sn-adapter internals/digest.ts',
} as const;
