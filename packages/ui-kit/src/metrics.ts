/**
 * The visual tokens for the Manta (Ink2Pic brief section 8.4), in pixels for React Native. Their values
 * are set in tokens.json alone, which the Android apps read too (#275). Each token names a role, so
 * calibrating one role on the device moves only that role (#53).
 * Layout units are density-independent: on the Manta PixelRatio is 1.875 and the window is
 * 1024 x 1365 units for 1920 x 2560 pixels (build 0.1.0 (1), #3), so millimetres are converted
 * with the runtime PixelRatio.
 */
import {PixelRatio} from 'react-native';
import tokens from './tokens.json';

const SCALE = 1 / PixelRatio.get();
/** Physical pixels per millimetre on the 299 ppi Manta screen. */
const PX_PER_MM = tokens.pxPerMm.value;
/** Each size in millimetres, each ratio and each colour, with its source, in tokens.json (#275). */
const MM = tokens.mm;
const RATIO = tokens.ratio;
const COLOUR = tokens.colour;

const mm = (millimetres: number) => Math.round(millimetres * PX_PER_MM * SCALE);

const space = mm(MM.space.value);
const border = Math.max(1, mm(MM.border.value));
const bodyFont = mm(MM.bodyFont.value);

export const metrics = {
  touchTarget: mm(MM.touchTarget.value),
  /** A button and the text field: one height, so a field and its button line up. */
  controlHeight: mm(MM.controlHeight.value),
  rowButtonWidth: mm(MM.rowButtonWidth.value),
  border,
  /** The line between two rows of one group, thinner than a border, in whole device pixels so every line of a group is as thick (#275). */
  separator: Math.max(1, Math.round(MM.separator.value * PX_PER_MM)) * SCALE,
  selectedBarHeight: border * RATIO.selectedBarBorders.value,

  /** Between the screen's edge and its content. */
  screenPadding: space,
  /** Between the stacked parts of a screen: the bar, the status line, the grid, the page buttons. */
  sectionGap: space,
  /** Above a group of rows, so each group reads apart from the one above (#275). */
  groupGap: space * RATIO.groupGapSpaces.value,
  /** Between the controls of one row. */
  controlGap: space,
  /** Inside a button or the field, before the label or text; the selected bar's inset too. */
  controlPadding: space,
  /** From a selected toggle's bar to the button's bottom edge. */
  selectedBarInset: Math.round(space / 2),
  /** Above and below the text of a list row. */
  rowPadding: space,
  /** Between the tiles of the results grid. */
  tileGap: space,

  minFont: mm(MM.minFont.value),
  fontBody: bodyFont,
  /** The title bar's title, as the native one (#275). */
  fontTitle: mm(MM.titleFont.value),
  /** A row's subtitle, as the native one (#275). */
  fontSubtitle: mm(MM.subtitleFont.value),
  fontLarge: bodyFont * RATIO.largeFont.value,
  statusLineHeight: Math.round(bodyFont * RATIO.lineHeight.value),

  titleBarHeight: mm(MM.titleBarHeight.value),
  navMarkWidth: mm(MM.navMarkWidth.value),
  switchWidth: mm(MM.switchWidth.value),
  radioSize: mm(MM.radioSize.value),
  radioDot: mm(MM.radioDot.value),
  iconSize: mm(MM.iconSize.value),
  pageMarkHeight: border * RATIO.pageMarkBorders.value,

  ink: COLOUR.ink.value,
  paper: COLOUR.paper.value,
  /** Section headings, hints and values: the context grey, 9.7:1 on paper (README › Grey as colour, #50). */
  context: COLOUR.context.value,
  /** The field's placeholder: a grey that keeps 7:1 contrast on paper (interface rule 3). */
  placeholder: COLOUR.placeholder.value,
  /** Selected text in the field: a light grey, so the ink text stays readable over it. */
  selection: COLOUR.selection.value,
} as const;
