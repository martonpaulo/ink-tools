/**
 * Whether the view shows the collection (#249): «Paste Collection» opens the view on it, as
 * «Choose Image» opens it on its screen (src/choose.ts); the Settings entry and Close leave it.
 */
type Listener = (open: boolean) => void;

let open = false;
const listeners = new Set<Listener>();

function set(next: boolean): void {
  open = next;
  listeners.forEach(listener => listener(next));
}

export const collectionOpen = (): boolean => open;

export function openCollection(): void {
  set(true);
}

export function closeCollection(): void {
  set(false);
}

/** Calls `listener` on each change; the returned function stops it. */
export function onCollection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
