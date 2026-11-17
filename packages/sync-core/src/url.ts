/**
 * A URL's parts, read from the string itself. React Native 0.79's `URL` parses but throws on
 * `protocol`, `host`, `pathname` and every other getter but `href` (`Libraries/Blob/URL.js`), so
 * tablet code never reads a `URL` getter; `scripts/boundaries.py` rule `url` keeps it so (#209).
 */
export interface UrlParts {
  /** Lower case, with its colon: `https:`. */
  protocol: string;
  /** `hostname` plus `:port` when a port is written. */
  host: string;
  /** Lower case; an IPv6 address keeps its brackets. */
  hostname: string;
  /** Digits only, or empty. */
  port: string;
  /** `/` when the URL has no path. */
  pathname: string;
  /** With its `?`, or empty. */
  search: string;
  /** With its `#`, or empty. */
  hash: string;
}

// scheme ":" "//" [userinfo "@"] host [":" port] path ["?" query] ["#" fragment]
const ABSOLUTE = /^([A-Za-z][A-Za-z0-9+.-]*:)\/\/(?:[^@/?#]*@)?(\[[0-9A-Fa-f:.]+\]|[^:/?#[\]]+)(?::(\d*))?((?:\/[^?#]*)?)(\?[^#]*)?(#.*)?$/;

/**
 * The parts of an absolute URL with an authority (`scheme://host/...`), or null for anything else:
 * a relative or empty string, no host, a non-numeric port, or a space or control character.
 * The user name and password never reach a part, so an error may print `protocol//host`.
 */
export function parseUrl(url: string): UrlParts | null {
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return null;
  const m = ABSOLUTE.exec(url);
  if (!m) return null;
  const [, scheme, name, port = '', path, search = '', hash = ''] = m;
  const hostname = name.toLowerCase();
  return {
    protocol: scheme.toLowerCase(),
    host: port ? `${hostname}:${port}` : hostname,
    hostname,
    port,
    pathname: path || '/',
    search,
    hash,
  };
}
