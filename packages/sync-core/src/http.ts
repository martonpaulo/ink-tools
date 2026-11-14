/** The one HTTP seam under every provider: an injected fetch and the https rule (#85). */
export interface HttpInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** `Reads` names the body readers a provider needs: `json`, `text` or both. */
export type HttpFetch<Reads = {json(): Promise<unknown>}> = (url: string, init: HttpInit) => Promise<{ok: boolean; status: number} & Reads>;

/**
 * The URL when it is `https:`, else a refusal naming only the scheme and host: a feed address can
 * hold a secret path or query, and a CalDAV request carries the app password (#80).
 */
export function requireHttps(url: string, what: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${what} needs an https: URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${what} needs an https: URL, got ${parsed.protocol}//${parsed.host}`);
  return url;
}
