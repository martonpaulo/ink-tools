/**
 * Lists and screens that page instead of scrolling, as the Supernote's own lists do (owner,
 * 2026-11-28, superseding D108's «More below» for lists of same-family items, #548): what fits the
 * space the parent gives, whole, then the native `Pager` at the bottom when more pages follow.
 * Nothing scrolls, so the e-ink screen never redraws a list in its fast, faded mode (#575), and
 * nothing ends inside a row or under a fixed control (#578).
 *
 * - `PagedList`: rows of one family under one caption, the caption and note on every page.
 * - `PagedColumn`: a screen's parts, such as several `RowGroup`s, kept whole, one page after another.
 *
 * Both measure before they page: the first layout draws every part, invisible, in the box; each
 * part's height and the box's give the pages, which the next layout draws. Where nothing lays out,
 * as in a unit test, every part stays drawn, so a test still finds each row.
 */
import React, {useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';
import {metrics} from './metrics';
import {Pager} from './Pager';
import {RowGroup} from './SettingRows';

/** The `nativeID` of a paged list or column, which the render rules find it by (#548). */
export const PAGED_LIST_ID = 'paged-list';

/** A layout unit's fraction a drawn edge may be off by. */
const TOLERANCE = 0.5;

/** One page: the parts from `from` up to, not including, `to`. */
export type PageRange = {from: number; to: number};

/**
 * The pages of parts of `heights` in `room`: each page holds `chrome` (a caption, a note, a line)
 * and its parts with `gap` between two; when one page cannot hold them all, every page keeps
 * `pager` for the pager. A part taller than a page gets a page of its own.
 */
export function paginate(heights: readonly number[], room: number, chrome: number, gap: number, pager: number): PageRange[] {
  const tall = (from: number, to: number) =>
    chrome + heights.slice(from, to).reduce((sum, h) => sum + h, 0) + gap * Math.max(0, to - from - 1);
  if (tall(0, heights.length) <= room + TOLERANCE) {
    return [{from: 0, to: heights.length}];
  }
  const pages: PageRange[] = [];
  for (let from = 0; from < heights.length; ) {
    let to = from + 1;
    while (to < heights.length && tall(from, to + 1) + pager <= room + TOLERANCE) {
      to += 1;
    }
    pages.push({from, to});
    from = to;
  }
  return pages;
}

type Measure = {
  /** The box's height, once laid out. */
  room: number | null;
  /** Each part's height, by its key, once laid out: a part shown or hidden keeps the others'. */
  heights: Record<string, number>;
  /** The whole drawn height of the parts with their chrome, once laid out. */
  whole: number | null;
};

/**
 * The parts as a flat list with their keys: a fragment's children are parts of their own, as a
 * group a setting shows or hides is written as a fragment; `false`, `null` and `undefined` leave.
 */
export function partsOf(children: React.ReactNode, prefix = ''): {key: string; part: React.ReactNode}[] {
  return React.Children.toArray(children).flatMap((child, index) => {
    const key = `${prefix}${React.isValidElement(child) && child.key !== null ? child.key : index}`;
    if (React.isValidElement(child) && child.type === React.Fragment) {
      return partsOf((child.props as {children?: React.ReactNode}).children, `${key}/`);
    }
    return [{key, part: child}];
  });
}

/** The pages of the parts with `keys`, from their measured heights; null until every height is known. */
function usePages(keys: readonly string[], chromeOf: (m: Measure, sum: number) => number, gap: number) {
  const [measure, setMeasure] = useState<Measure>({room: null, heights: {}, whole: null});
  const [page, setPage] = useState(1);
  const changed = (a: number | null | undefined, b: number) => a === null || a === undefined || Math.abs(a - b) > TOLERANCE;
  const onBox = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setMeasure(m => (changed(m.room, next) ? {...m, room: next} : m));
  };
  const onWhole = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setMeasure(m => (changed(m.whole, next) ? {...m, whole: next} : m));
  };
  const onPart = (key: string) => (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setMeasure(m => (changed(m.heights[key], next) ? {...m, heights: {...m.heights, [key]: next}} : m));
  };
  const heights = keys.map(key => measure.heights[key]);
  const known = measure.room !== null && measure.whole !== null && heights.every(h => h !== undefined);
  let pages: PageRange[] | null = null;
  if (known) {
    const sizes = heights as number[];
    const sum = sizes.reduce((total, h) => total + h, 0);
    pages = paginate(sizes, measure.room as number, chromeOf(measure, sum), gap, metrics.touchTarget);
  }
  const current = pages ? Math.min(page, pages.length) : 1;
  return {pages, current, setPage, onBox, onWhole, onPart};
}

/** The parts, each in a view that reports its height. */
const measured = (parts: {key: string; part: React.ReactNode}[], onPart: (key: string) => (event: LayoutChangeEvent) => void) =>
  parts.map(({key, part}) => (
    <View key={key} onLayout={onPart(key)}>
      {part}
    </View>
  ));
/** The parts of one page, keyed. */
const shownOf = (parts: {key: string; part: React.ReactNode}[], range: PageRange) =>
  parts.slice(range.from, range.to).map(({key, part}) => <React.Fragment key={key}>{part}</React.Fragment>);

function Pages({
  pages,
  current,
  setPage,
  onBox,
  children,
}: {
  pages: PageRange[] | null;
  current: number;
  setPage: (page: number) => void;
  onBox: (event: LayoutChangeEvent) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View nativeID={PAGED_LIST_ID} testID={PAGED_LIST_ID} style={styles.box} onLayout={onBox}>
      {/* Until it is measured, the page is drawn invisible: a guessed page would flash on e-ink. */}
      <View style={[styles.content, !pages && styles.measuring]}>
        {children}
        {pages && pages.length > 1 && <Pager page={current} total={pages.length} onPage={setPage} />}
      </View>
    </View>
  );
}

export type PagedListProps = {
  /** The list's name, the caption over its rows on every page. */
  caption?: string;
  /** The rows, `ListRow`s of one family; `false`, `null` and `undefined` are left out. */
  children?: React.ReactNode;
  /** What explains the list, under the last row of every page. */
  note?: string | readonly string[];
};

/** Rows of one family under one caption, paged (#548). */
export function PagedList({caption, children, note}: PagedListProps): React.JSX.Element {
  const rows = partsOf(children);
  // The group's caption, note and lines: its drawn height less its rows and the lines between them.
  const chromeOf = (m: Measure, sum: number) => (m.whole as number) - sum - metrics.lightLine * Math.max(0, rows.length - 1);
  const {pages, current, setPage, onBox, onWhole, onPart} = usePages(rows.map(r => r.key), chromeOf, metrics.lightLine);
  const range = pages ? pages[current - 1] : {from: 0, to: rows.length};
  return (
    <Pages pages={pages} current={current} setPage={setPage} onBox={onBox}>
      <View onLayout={pages ? undefined : onWhole}>
        <RowGroup caption={caption} note={note}>
          {pages ? shownOf(rows, range) : measured(rows, onPart)}
        </RowGroup>
      </View>
    </Pages>
  );
}

export type PagedColumnProps = {
  /** The screen's parts, such as `RowGroup`s, each kept whole on one page. */
  children?: React.ReactNode;
};

/** A screen's parts, one page after another, for a screen that is more than one list (#548). */
export function PagedColumn({children}: PagedColumnProps): React.JSX.Element {
  const parts = partsOf(children);
  const {pages, current, setPage, onBox, onWhole, onPart} = usePages(parts.map(p => p.key), () => 0, 0);
  const range = pages ? pages[current - 1] : {from: 0, to: parts.length};
  return (
    <Pages pages={pages} current={current} setPage={setPage} onBox={onBox}>
      <View onLayout={pages ? undefined : onWhole}>{pages ? shownOf(parts, range) : measured(parts, onPart)}</View>
    </Pages>
  );
}

const styles = StyleSheet.create({
  // The space the parent leaves, never more: a fixed part under it keeps its own room (#578).
  box: {flex: 1, overflow: 'hidden'},
  // The pager at the bottom of the box, as the native lists put it.
  content: {flexGrow: 1, justifyContent: 'space-between'},
  measuring: {opacity: 0},
});
