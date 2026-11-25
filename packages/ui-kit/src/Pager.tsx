/**
 * The native pager (#273, #287): |‹ ‹ page / total › ›|, drawn arrows at the native size, the
 * current page in bold, as the native one marks it. A button that would leave the range is
 * disabled and its arrow grey, so `onPage` only ever gets a page from 1 to the last.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  FIRST_PAGE_LABEL,
  LAST_PAGE_LABEL,
  NEXT_PAGE_LABEL,
  pageOfLabel,
  PREVIOUS_PAGE_LABEL,
} from './controlsCopy';
import {PageArrow} from './marks';
import {metrics} from './metrics';
import {shared} from './styles';

export type PagerProps = {
  /** The current page, from 1. */
  page: number;
  /** The number of pages; none or one shows 1 / 1. */
  total: number;
  onPage: (page: number) => void;
};

type TurnProps = {
  label: string;
  toward: 'left' | 'right';
  edge?: boolean;
  disabled: boolean;
  onPress: () => void;
};

function Turn({label, toward, edge, disabled, onPress}: TurnProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      style={styles.turn}
      onPress={onPress}>
      <PageArrow toward={toward} edge={edge} disabled={disabled} />
    </Pressable>
  );
}

export function Pager({page, total, onPage}: PagerProps): React.JSX.Element {
  const last = Math.max(1, Math.floor(total));
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  const atStart = current === 1;
  const atEnd = current === last;
  return (
    <View style={styles.pager}>
      <Turn label={FIRST_PAGE_LABEL} toward="left" edge disabled={atStart} onPress={() => onPage(1)} />
      <Turn label={PREVIOUS_PAGE_LABEL} toward="left" disabled={atStart} onPress={() => onPage(current - 1)} />
      <Text accessibilityLabel={pageOfLabel(current, last)} style={[shared.subtitle, styles.number]}>
        <Text testID="current-page" style={styles.current}>
          {current}
        </Text>
        {` / ${last}`}
      </Text>
      <Turn label={NEXT_PAGE_LABEL} toward="right" disabled={atEnd} onPress={() => onPage(current + 1)} />
      <Turn label={LAST_PAGE_LABEL} toward="right" edge disabled={atEnd} onPress={() => onPage(last)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // It wraps, as every row of more than three buttons does (screenBreaks, #224).
  pager: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turn: {
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {marginHorizontal: metrics.pagerNumberGap},
  current: {fontWeight: 'bold'},
});
