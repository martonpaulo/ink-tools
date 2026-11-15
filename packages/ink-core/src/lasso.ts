/**
 * The lassoed handwriting as a search query (#109, from Ink2Pic). The page size is the `size`
 * recognizeElements needs: the lasso size fails with 117 (device tests, builds 1 to 3). The host
 * port keeps sn-plugin-lib out of this package, so its tests need no device.
 */
import type {Outcome} from './outcome';

export type Rect = {left: number; top: number; right: number; bottom: number};
export type Size = {width: number; height: number};

/** Where the lasso was when the view opened; lasso context does not survive navigation. */
export type LassoPlace = {
  rect: Rect;
  page: number;
  pageSize: Size;
  /**
   * The person stayed on the note (no view): the lasso and the page are read again before the
   * word is deleted or the picture lassoed, and nothing is done when they changed.
   */
  recheck?: true;
};

export type LassoQuery = {query: string; place: LassoPlace | null};

/** Wraps one host call for the log; without one, the call runs as it is. */
export type Logged<F extends {ok: false; message: string}> = <T>(
  label: string,
  call: () => Promise<Outcome<T, F>>,
) => Promise<Outcome<T, F>>;

/** The host's logger, else one that only runs the call. */
export function loggerOf<F extends {ok: false; message: string}>(host: {
  logged?: Logged<F>;
}): Logged<F> {
  return host.logged ?? ((_label, call) => call());
}

/** The plugin's SDK calls and failure shape that readLassoQuery needs. */
export type LassoHost<F extends {ok: false; message: string}> = {
  getLassoElements(): Promise<Outcome<object[], F>>;
  getLassoRect(): Promise<Outcome<Rect, F>>;
  getCurrentFilePath(): Promise<Outcome<string, F>>;
  getCurrentPageNum(): Promise<Outcome<number, F>>;
  getPageSize(path: string, page: number): Promise<Outcome<Size, F>>;
  recognizeElements(elements: object[], size: Size): Promise<Outcome<string, F>>;
  /** The lasso holds no handwriting. */
  emptyLasso(message: string): F;
  /** Any other failure. */
  failure(message: string): F;
  logged?: Logged<F>;
};

/**
 * The recognized word, trimmed, and where the lasso was; an empty recognition is a failure, never
 * an empty query. A missing rect only loses the placement.
 */
export async function readLassoQuery<F extends {ok: false; message: string}>(
  host: LassoHost<F>,
  /** The elements the opening already read: not read again. */
  known?: object[],
): Promise<Outcome<LassoQuery, F>> {
  const logged = loggerOf(host);
  const elements: Outcome<object[], F> = known
    ? {ok: true, value: known}
    : await logged('getLassoElements', () => host.getLassoElements());
  if (!elements.ok) {
    return elements;
  }
  if (elements.value.length === 0) {
    return host.emptyLasso('the lasso holds no handwriting');
  }
  // The rect too, before the slow recognition: lasso context is short-lived.
  const rect = await logged('getLassoRect', () => host.getLassoRect());
  const path = await logged('getCurrentFilePath', () =>
    host.getCurrentFilePath(),
  );
  if (!path.ok) {
    return path;
  }
  const page = await logged('getCurrentPageNum', () =>
    host.getCurrentPageNum(),
  );
  if (!page.ok) {
    return page;
  }
  const size = await logged('getPageSize', () =>
    host.getPageSize(path.value, page.value),
  );
  if (!size.ok) {
    return size;
  }
  const place = rect.ok
    ? {rect: rect.value, page: page.value, pageSize: size.value}
    : null;
  const text = await logged('recognizeElements', () =>
    host.recognizeElements(elements.value, size.value),
  );
  if (!text.ok) {
    return text;
  }
  const query = text.value.trim();
  if (!query) {
    return host.failure('the handwriting was recognized as empty text');
  }
  return {ok: true, value: {query, place}};
}
