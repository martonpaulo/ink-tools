/**
 * The native title bar (#273, #272): a black band with the × to close at the leading edge, its
 * centre where the native one sits, and the title in the native size and regular weight. With
 * `paneTitle` it has the native two levels, «× Settings ‹ Language & Region»: the × and the pane's
 * title over the left pane, then ‹ and the page's title centred over the rest. Without it, the
 * title is centred on the band's full width, and the × never pushes it (owner, #275).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {BACK_LABEL} from './controlsCopy';
import {BackMark, CloseMark} from './marks';
import {metrics} from './metrics';
import {CLOSE_TEXT} from './problem';
import {shared} from './styles';

export type TitleBarProps = {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  /** The title over the left pane, such as «Settings» beside the open page's title. */
  paneTitle?: string;
};

/** From the band's edge to the ×'s touch target, so the ×'s centre falls where the native one does. */
const CLOSE_INSET = Math.max(0, metrics.closeCentre - metrics.touchTarget / 2);
const CLOSE_SLOT = CLOSE_INSET + metrics.touchTarget;
/** The ‹'s slot: its mark starts at the side margin, in line with the rows' text, as the native one. */
const BACK_SLOT = Math.max(metrics.touchTarget, metrics.sideMargin + metrics.backMarkHeight / 2);

function Close({onClose}: {onClose: () => void}): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={CLOSE_TEXT} style={styles.close} onPress={onClose}>
      <CloseMark />
    </Pressable>
  );
}

function Back({onBack}: {onBack: () => void}): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={BACK_LABEL} style={styles.back} onPress={onBack}>
      <BackMark />
    </Pressable>
  );
}

/** A title centred between two slots of the same width, so what sits in the leading one never pushes it. */
function Centred({title, lead, slot}: {title: string; lead: React.ReactNode; slot: number}): React.JSX.Element {
  return (
    <View style={styles.level}>
      <View style={[styles.slot, {width: slot}]}>{lead}</View>
      {/* Two lines at most, never cut short; the band grows with them (interface rule 9, #275). */}
      <Text accessibilityRole="header" numberOfLines={2} style={[shared.barTitle, styles.main]}>
        {title}
      </Text>
      <View style={{width: slot}} />
    </View>
  );
}

export function TitleBar({title, onClose, onBack, paneTitle}: TitleBarProps): React.JSX.Element {
  if (paneTitle !== undefined) {
    return (
      <View style={styles.band}>
        <View style={[styles.pane, !onClose && {paddingLeft: metrics.sideMargin}]}>
          {onClose && <Close onClose={onClose} />}
          <Text numberOfLines={1} style={[shared.barTitle, styles.paneTitle]}>
            {paneTitle}
          </Text>
        </View>
        <Centred title={title} lead={onBack && <Back onBack={onBack} />} slot={onBack ? BACK_SLOT : 0} />
      </View>
    );
  }
  const lead = (
    <>
      {onClose && <Close onClose={onClose} />}
      {onBack && <Back onBack={onBack} />}
    </>
  );
  const slot = (onClose ? CLOSE_SLOT : 0) + (onBack ? BACK_SLOT : 0);
  return (
    <View style={styles.band}>
      <Centred title={title} lead={lead} slot={slot} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {flexDirection: 'row', minHeight: metrics.titleBarHeight, backgroundColor: metrics.ink},
  level: {flex: 1, flexDirection: 'row', alignItems: 'center'},
  slot: {flexDirection: 'row', alignItems: 'center'},
  pane: {width: metrics.navPaneWidth, flexDirection: 'row', alignItems: 'center'},
  // The pane's title starts where the native one does, after the ×'s target.
  paneTitle: {flexShrink: 1, marginLeft: Math.max(0, metrics.paneTitleStart - CLOSE_SLOT)},
  close: {
    marginLeft: CLOSE_INSET,
    minWidth: metrics.touchTarget,
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  back: {
    minWidth: BACK_SLOT,
    minHeight: metrics.touchTarget,
    paddingLeft: metrics.sideMargin,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  main: {flex: 1, textAlign: 'center'},
});
