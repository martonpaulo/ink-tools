/** The styles every screen repeats, built from the tokens in metrics.ts (#53, #94). */
import {StyleSheet} from 'react-native';
import {metrics} from './metrics';

/** The lines the status line reserves: the longest failure sentences wrap once on the Manta. */
export const STATUS_LINES = 2;

export const shared = StyleSheet.create({
  /** The outer view of every screen. */
  screen: {
    flex: 1,
    backgroundColor: metrics.paper,
    padding: metrics.screenPadding,
    gap: metrics.sectionGap,
  },
  /** The thick ink border of a button, a tile and the field (brief 8.4). */
  outline: {borderWidth: metrics.border, borderColor: metrics.ink},
  /**
   * A control that cannot act: a dashed border in the context grey, never a black fill, so it reads
   * apart from an enabled one at a glance (interface rule 16, #233). With `disabledText`.
   */
  disabledOutline: {
    borderStyle: 'dashed',
    borderColor: metrics.context,
    backgroundColor: metrics.paper,
  },
  /** The label of a control that cannot act, in the context grey (#233). */
  disabledText: {color: metrics.context},
  /** A row of controls. */
  row: {flexDirection: 'row', alignItems: 'center', gap: metrics.controlGap},
  /** A row of many buttons, which wraps to a new line when full (#224). */
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: metrics.controlGap,
  },
  /** A row of controls at the trailing edge, as OK in the system dialogs. */
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.controlGap,
    justifyContent: 'flex-end',
  },
  /** A list row with its dotted separator, as in the system Settings (brief 8.4, #50). */
  listRow: {
    minHeight: metrics.touchTarget,
    paddingVertical: metrics.rowPadding,
    borderBottomWidth: metrics.border,
    borderStyle: 'dotted',
    borderColor: metrics.ink,
  },
  /** The one status line, with its lines reserved so nothing above or below it moves. */
  statusLine: {
    lineHeight: metrics.statusLineHeight,
    minHeight: metrics.statusLineHeight * STATUS_LINES,
  },
  text: {fontSize: metrics.fontBody, color: metrics.ink},
  /** A section heading, as the native caption: body size, regular weight, in the context grey (README › Type, #275). */
  heading: {fontSize: metrics.fontBody, color: metrics.context},
  /** A hint or a current value under a row's name: body size in the context grey (#50). */
  hint: {fontSize: metrics.fontBody, color: metrics.context},
  /** A screen's own title, where it has no title bar yet: the native title's size (#275). */
  title: {fontSize: metrics.fontTitle, color: metrics.ink},
  /** The ×, ‹ and › glyphs. */
  textLarge: {fontSize: metrics.fontLarge, color: metrics.ink},
});
