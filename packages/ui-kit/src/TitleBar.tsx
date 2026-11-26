/**
 * The native title bar (#273, #272): a black band with the × to close at the leading edge, its
 * centre where the native one sits, and the title in the native size and regular weight. With
 * `paneTitle` it has the native two levels, «× Settings ‹ Language & Region»: the × and the pane's
 * title over the left pane, then ‹ and the page's title centred over the rest. Without it, the
 * title is centred on the band's full width, and the × never pushes it (owner, #275).
 * The band runs from edge to edge at the top of the screen, as the native one does (#309): it
 * opens a `shared.screen` and reaches back over that view's padding, which stays on the content
 * below it, so every screen gets the native band with no layout of its own.
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
  /**
   * The screen's own action, as text at the band's trailing edge, where the native title bar puts
   * one (#287, #411): the one place for a screen-level action such as «Sync now». Without
   * `onPress` it shows a state, such as «Syncing…», and takes no tap.
   */
  action?: BarAction;
};

export type BarAction = {label: string; onPress?: () => void};

/** The `nativeID` of the bar's action, a screen-level action the render rules read (#411). */
export const BAR_ACTION_ID = 'bar-action';

/** From the band's edge to the ×'s touch target, so the ×'s centre falls where the native one does. */
const CLOSE_INSET = Math.max(0, metrics.closeCentre - metrics.touchTarget / 2);
const CLOSE_SLOT = CLOSE_INSET + metrics.touchTarget;
/** The ‹'s slot: its mark starts at the side margin, in line with the rows' text, as the native one. */
/** The action's slot: a row button's width and the side margin, so «Sync now» fits on one line. */
const ACTION_SLOT = metrics.rowButtonWidth + metrics.sideMargin;
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

/** The band's testID, which the renders' edge rule finds the band by (#309). */
export const TITLE_BAR_ID = 'title-bar';

/** The bar's text action at its trailing edge, its target the band's full height (#411). */
function Action({action}: {action: BarAction}): React.JSX.Element {
  const label = <Text style={[shared.barAction, styles.actionText]}>{action.label}</Text>;
  if (!action.onPress) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.action}>
        {label}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      nativeID={BAR_ACTION_ID}
      style={styles.action}
      onPress={action.onPress}>
      {label}
    </Pressable>
  );
}

/** A title centred between two slots of the same width, so what sits in either one never pushes it. */
function Centred({
  title,
  lead,
  slot,
  action,
}: {
  title: string;
  lead: React.ReactNode;
  slot: number;
  action?: BarAction;
}): React.JSX.Element {
  const width = action ? Math.max(slot, ACTION_SLOT) : slot;
  return (
    <View style={styles.level}>
      <View style={[styles.slot, {width}]}>{lead}</View>
      {/* Two lines at most, never cut short; the band grows with them (interface rule 9, #275). */}
      <Text accessibilityRole="header" numberOfLines={2} style={[shared.barTitle, styles.main]}>
        {title}
      </Text>
      <View style={[styles.trail, {width}]}>{action && <Action action={action} />}</View>
    </View>
  );
}

export function TitleBar({title, onClose, onBack, paneTitle, action}: TitleBarProps): React.JSX.Element {
  if (paneTitle !== undefined) {
    return (
      <View style={styles.band} testID={TITLE_BAR_ID}>
        <View style={[styles.pane, !onClose && {paddingLeft: metrics.sideMargin}]}>
          {onClose && <Close onClose={onClose} />}
          <Text numberOfLines={1} style={[shared.barTitle, styles.paneTitle]}>
            {paneTitle}
          </Text>
        </View>
        <Centred
          title={title}
          lead={onBack && <Back onBack={onBack} />}
          slot={onBack ? BACK_SLOT : 0}
          action={action}
        />
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
    <View style={styles.band} testID={TITLE_BAR_ID}>
      <Centred title={title} lead={lead} slot={slot} action={action} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the screen's padding on the top and both sides, so the band touches the edges (#309).
  band: {
    flexDirection: 'row',
    minHeight: metrics.titleBarHeight,
    backgroundColor: metrics.ink,
    marginTop: -metrics.screenPadding,
    marginHorizontal: -metrics.screenPadding,
  },
  level: {flex: 1, flexDirection: 'row', alignItems: 'center'},
  slot: {flexDirection: 'row', alignItems: 'center'},
  pane: {width: metrics.navPaneWidth, flexDirection: 'row', alignItems: 'center'},
  // The pane's title starts where the native one does, after the ×'s target.
  paneTitle: {flexShrink: 1, marginLeft: Math.max(0, metrics.paneTitleStart - CLOSE_SLOT)},
  // The × and ‹ take the band's full height, as the native title bar's back target does (#287).
  close: {
    marginLeft: CLOSE_INSET,
    minWidth: metrics.touchTarget,
    minHeight: metrics.titleBarHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  back: {
    minWidth: BACK_SLOT,
    minHeight: metrics.titleBarHeight,
    paddingLeft: metrics.sideMargin,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  main: {flex: 1, textAlign: 'center'},
  trail: {flexDirection: 'row', justifyContent: 'flex-end', alignSelf: 'stretch'},
  // The action's text ends at the side margin, as the rows' controls do (#272).
  action: {
    minWidth: metrics.touchTarget,
    minHeight: metrics.titleBarHeight,
    paddingRight: metrics.sideMargin,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  actionText: {textAlign: 'right'},
});
