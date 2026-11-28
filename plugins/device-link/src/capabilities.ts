/**
 * What Device Link offers as a route of the note-transport interface (#504, #496), declared in
 * `capabilities.json`, not in code: each capability, its direction, and the requirements a person
 * must meet first. The words for each requirement are `copy.requirements`.
 */
import declared from './capabilities.json';
import {copy} from './copy';

export type Direction = 'toTablet' | 'toMac';
export type Capability = {
  id: string;
  operation: string;
  direction: Direction;
  requires: string[];
};

export const ROUTE: string = declared.route;
export const CAPABILITIES = declared.capabilities as Capability[];

/** The capability of `operation` in `direction`, or null when this route does not offer it. */
export function capability(operation: string, direction: Direction): Capability | null {
  return CAPABILITIES.find(c => c.operation === operation && c.direction === direction) ?? null;
}

/** Each requirement of `cap` with its words: what is missing and the one step that fixes it. */
export function requirements(cap: Capability): {id: string; what: string; step: string}[] {
  return cap.requires.map(id => ({id, ...copy.requirements[id]}));
}
