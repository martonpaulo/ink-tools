/**
 * Lists and screens that page instead of scrolling, as the Supernote's own lists do (owner,
 * 2026-11-28, superseding D108's «More below» for lists of same-family items, #548): what fits the
 * space the parent gives, whole, then the native `Pager` under it when more pages follow. Nothing
 * scrolls, so the e-ink screen never redraws a list in its fast, faded mode (#575), and nothing
 * ends inside a row or under a fixed control (#578).
 *
 * - `PagedColumn`: a screen's parts, one page after another. A `RowGroup` taller than a page goes
 *   on over several pages, its caption and note on each, so every row stays reachable.
 * - `PagedList`: rows of one family under one caption: a `PagedColumn` of one `RowGroup`.
 *
 * It measures before it pages: the first layout draws every part, invisible, in its box, and each
 * row's, group's and part's height gives the pages. Each shown part goes on reporting its height,
 * so a part that grows or appears pages again; one not measured yet counts as a native row.
 * Where nothing lays out, as in a unit test, every part stays drawn, so a test still finds it.
 */
import React, {useRef, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';
import {metrics} from './metrics';
import {Pager} from './Pager';
import {ChoiceList, ChoiceListProps, choiceRows, RadioListBox, RowGroup, RowGroupProps} from './SettingRows';

/** The `nativeID` of a paged list or column, which the render rules find it by (#548). */
export const PAGED_LIST_ID = 'paged-list';

/** A layout unit's fraction a drawn edge may be off by. */
const TOLERANCE = 0.5;

/** One page: the units from `from` up to, not including, `to`. */
export type PageRange = {from: number; to: number};

/**
 * What a page is made of: a part drawn whole, or one row of a `RowGroup`, which costs its
 * group's caption, note and lines (`chrome`) on each page the group shows on, and the light line
 * (`gap`) between two of its rows.
 */
export type Unit = {height: number; group?: {key: string; chrome: number; gap: number}};

/** The height of `units` on one page. */
function pageHeight(units: readonly Unit[]): number {
  return units.reduce((sum, unit, i) => {
    const joined = unit.group && units[i - 1]?.group?.key === unit.group.key;
    return sum + unit.height + (unit.group ? (joined ? unit.group.gap : unit.group.chrome) : 0);
  }, 0);
}

/**
 * The pages of `units` in `room`: one page when everything fits with no pager, else as many units
 * as fit beside `pager` on each page, at least one; a unit taller than a page gets one of its own.
 * A group's last row never stands alone on a page: the row before it moves with it (#594).
 */
export function paginate(units: readonly Unit[], room: number, pager: number): PageRange[] {
  if (pageHeight(units) <= room + TOLERANCE) {
    return [{from: 0, to: units.length}];
  }
  const pages: PageRange[] = [];
  for (let from = 0; from < units.length; ) {
    let to = from + 1;
    while (to < units.length && pageHeight(units.slice(from, to + 1)) + pager <= room + TOLERANCE) {
      to += 1;
    }
    // Never leave one row of a group alone on the next page: the page before gives it a neighbour (#594).
    const [last, before, next, after] = [units[to - 1], units[to - 2], units[to], units[to + 1]];
    if (to - from > 1 && last.group && before?.group?.key === last.group.key && next?.group?.key === last.group.key && after?.group?.key !== last.group.key) {
      to -= 1;
    }
    pages.push({from, to});
    from = to;
  }
  return pages;
}

/** A `radio` group is a `ChoiceList`'s rows, drawn in the radio list's box. */
type Group = {key: string; props: RowGroupProps; radio?: boolean};
type Item = {key: string; node: React.ReactNode; group?: Group};

/**
 * The units of `children` with their keys: a fragment's parts are parts of their own, as a group
 * a setting shows or hides is written as a fragment; a `RowGroup` with rows gives one unit per
 * row, and a `ChoiceList` the same, so a screen's intro and the first values of a list share a
 * page instead of the list going whole to the next one (#594); `false`, `null` and `undefined` leave.
 */
export function partsOf(children: React.ReactNode, prefix = ''): Item[] {
  return React.Children.toArray(children).flatMap((child, index): Item[] => {
    const key = `${prefix}${React.isValidElement(child) && child.key !== null ? child.key : index}`;
    if (!React.isValidElement(child)) {
      return [{key, node: child}];
    }
    if (child.type === React.Fragment) {
      return partsOf((child.props as {children?: React.ReactNode}).children, `${key}/`);
    }
    if (child.type === ChoiceList && !(child.props as ChoiceListProps<unknown>).paged) {
      const choice = child.props as ChoiceListProps<unknown>;
      const group = {key, props: {caption: choice.title, note: choice.note}, radio: true};
      return choiceRows(choice).map(row => ({key: `${key}/${row.key}`, node: row, group}));
    }
    if (child.type === RowGroup) {
      const props = child.props as RowGroupProps;
      const rows = React.Children.toArray(props.children);
      if (rows.length > 0) {
        const group = {key, props};
        return rows.map((row, i) => ({
          key: `${key}/${React.isValidElement(row) && row.key !== null ? row.key : i}`,
          node: row,
          group,
        }));
      }
    }
    return [{key, node: child}];
  });
}

/** The heights measured so far, by key: the box, a unit, or a group's whole drawn height. */
type Heights = Record<string, number>;
const BOX = 'box';
const wholeOf = (group: string) => `group:${group}`;

/** Each item as a unit, from what was measured, else the native row and group sizes. */
function unitsOf(items: readonly Item[], heights: Heights): Unit[] {
  return items.map(item => {
    const height = heights[item.key] ?? metrics.rowHeight;
    if (!item.group) {
      return {height};
    }
    const {key, props} = item.group;
    const rows = items.filter(other => other.group?.key === key);
    const whole = heights[wholeOf(key)];
    const sum = rows.reduce((total, row) => total + (heights[row.key] ?? metrics.rowHeight), 0);
    const gap = metrics.lightLine;
    // The caption, the note, the solid line and the gap under it: the group less its rows and lines.
    const chrome =
      whole === undefined
        ? (props.caption !== undefined ? metrics.captionHeight : 0) + metrics.separator + metrics.sectionGap
        : whole - sum - gap * (rows.length - 1);
    return {height, group: {key, chrome, gap}};
  });
}

/** Draws `items`, each in a view that reports its height, rows of one group in one `RowGroup`. */
function drawn(items: readonly Item[], all: readonly Item[], measure: (key: string) => (event: LayoutChangeEvent) => void) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < items.length; ) {
    const item = items[i];
    if (!item.group) {
      out.push(
        <View key={item.key} onLayout={measure(item.key)}>
          {item.node}
        </View>,
      );
      i += 1;
      continue;
    }
    const {key, props, radio} = item.group;
    let end = i;
    while (end < items.length && items[end].group?.key === key) {
      end += 1;
    }
    const rows = items.slice(i, end);
    const whole = rows.length === all.filter(other => other.group?.key === key).length;
    const group = (
      <RowGroup caption={props.caption} note={props.note}>
        {rows.map(row => (
          <View key={row.key} onLayout={measure(row.key)}>
            {row.node}
          </View>
        ))}
      </RowGroup>
    );
    out.push(
      // A whole group reports its drawn height, from which its caption and note are known.
      <View key={`${key}@${rows[0].key}`} onLayout={whole ? measure(wholeOf(key)) : undefined}>
        {radio ? <RadioListBox>{group}</RadioListBox> : group}
      </View>,
    );
    i = end;
  }
  return out;
}

export type PagedColumnProps = {
  /** The screen's parts, such as `RowGroup`s; a group taller than a page goes on over pages. */
  children?: React.ReactNode;
};

/** A screen's parts, one page after another (#548). */
export function PagedColumn({children}: PagedColumnProps): React.JSX.Element {
  const items = partsOf(children);
  const [heights, setHeights] = useState<Heights>({});
  const [page, setPage] = useState(1);
  // Once paged, a part shown later is measured where it shows, so the page never goes blank.
  const pagedOnce = useRef(false);
  const measure = (key: string) => (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setHeights(old => (old[key] !== undefined && Math.abs(old[key] - next) <= TOLERANCE ? old : {...old, [key]: next}));
  };
  const room = heights[BOX];
  const groups = [...new Set(items.flatMap(item => (item.group ? [item.group.key] : [])))];
  const unmeasured =
    items.some(item => heights[item.key] === undefined) || groups.some(key => heights[wholeOf(key)] === undefined);
  const first = room === undefined || (!pagedOnce.current && unmeasured);
  const pages = first ? null : paginate(unitsOf(items, heights), room, metrics.touchTarget);
  if (pages) {
    pagedOnce.current = true;
  }
  const current = pages ? Math.min(page, pages.length) : 1;
  const range = pages ? pages[current - 1] : {from: 0, to: items.length};
  return (
    <View nativeID={PAGED_LIST_ID} testID={PAGED_LIST_ID} style={styles.box} onLayout={measure(BOX)}>
      <View style={[styles.content, first && styles.measuring]}>{drawn(items.slice(range.from, range.to), items, measure)}</View>
      {/* Outside the clipped part, so a page that runs long still shows its pager. */}
      {pages && pages.length > 1 && <Pager page={current} total={pages.length} onPage={setPage} />}
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
  return (
    <PagedColumn>
      <RowGroup caption={caption} note={note}>
        {children}
      </RowGroup>
    </PagedColumn>
  );
}

const styles = StyleSheet.create({
  // The space the parent leaves, never more: a fixed part under it keeps its own room (#578).
  box: {flex: 1},
  // The page's parts, clipped to the room the pager leaves.
  content: {flex: 1, overflow: 'hidden'},
  measuring: {opacity: 0},
});
