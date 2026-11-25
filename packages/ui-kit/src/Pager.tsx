/**
 * The native pager (#273): |‹ ‹ page/total › ›|, the current page underlined. A button that would
 * leave the range is disabled, so `onPage` only ever gets a page from 1 to the last.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  FIRST_PAGE_LABEL,
  LAST_PAGE_LABEL,
  NEXT_PAGE_LABEL,
  PREVIOUS_PAGE_LABEL,
} from './controlsCopy';
import {GlyphButton} from './GlyphButton';
import {metrics} from './metrics';
import {shared} from './styles';

export type PagerProps = {
  /** The current page, from 1. */
  page: number;
  /** The number of pages; none or one shows 1/1. */
  total: number;
  onPage: (page: number) => void;
};

export function Pager({page, total, onPage}: PagerProps): React.JSX.Element {
  const last = Math.max(1, Math.floor(total));
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  const atStart = current === 1;
  const atEnd = current === last;
  return (
    <View style={styles.pager}>
      <GlyphButton glyph="|‹" accessibilityLabel={FIRST_PAGE_LABEL} disabled={atStart} onPress={() => onPage(1)} />
      <GlyphButton
        glyph="‹"
        accessibilityLabel={PREVIOUS_PAGE_LABEL}
        disabled={atStart}
        onPress={() => onPage(current - 1)}
      />
      <Text style={shared.text}>
        <Text testID="current-page" style={styles.current}>
          {current}
        </Text>
        /{last}
      </Text>
      <GlyphButton glyph="›" accessibilityLabel={NEXT_PAGE_LABEL} disabled={atEnd} onPress={() => onPage(current + 1)} />
      <GlyphButton glyph="›|" accessibilityLabel={LAST_PAGE_LABEL} disabled={atEnd} onPress={() => onPage(last)} />
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
    gap: metrics.controlGap,
  },
  current: {
    textDecorationLine: 'underline',
    textDecorationColor: metrics.ink,
  },
});
