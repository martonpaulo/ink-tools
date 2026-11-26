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
/** A length in whole device pixels, at least one, so every line of one kind is as thick (#272, #275). */
const devicePx = (millimetres: number) => Math.max(1, Math.round(millimetres * PX_PER_MM)) * SCALE;

const border = devicePx(MM.border.value);
const bodyFont = mm(MM.bodyFont.value);
const sideMargin = mm(MM.sideMargin.value);

export const metrics = {
  touchTarget: mm(MM.touchTarget.value),
  /** A button and the text field: one height, so a field and its button line up. */
  controlHeight: mm(MM.controlHeight.value),
  rowButtonWidth: mm(MM.rowButtonWidth.value),
  border,
  /** The solid line after a group's last row, in whole device pixels so every line is as thick (#272, #275). */
  separator: devicePx(MM.separator.value),
  /** The light dotted line between two rows of one group, in whole device pixels (#272). */
  lightLine: devicePx(MM.lightLine.value),
  /** The ink bar along a button's bottom edge while it is pressed, as the native button (#287). */
  pressBar: devicePx(MM.pressBar.value),
  /** The selection border around a chosen item (#272, #287). */
  selectionStroke: devicePx(MM.selectionStroke.value),
  selectionRadius: mm(MM.selectionRadius.value),

  /**
   * Between the screen's edge and its content: the native side margin, so a row's text starts
   * where the native Settings rows do (#272, #411).
   */
  screenPadding: sideMargin,
  /** Between the stacked parts of a screen: the bar, the status line, the grid, the page buttons. */
  sectionGap: space,
  /** Between the controls of one row. */
  controlGap: space,
  /** Inside a button or the field, before the label or text. */
  controlPadding: space,
  /** Above and below the text of a list row. */
  rowPadding: space,
  /** A list row's fixed height, as the native row, one or two lines of text (#272). */
  rowHeight: mm(MM.rowHeight.value),
  /** From a pane's edge to a row's text, and from a row's last control to the other edge (#272). */
  sideMargin,
  /** A section caption's box, its text at the bottom (#272). */
  captionHeight: mm(MM.captionHeight.value),
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
  navPaneWidth: mm(MM.navPaneWidth.value),
  paneTitleStart: mm(MM.paneTitleStart.value),
  /** The stroke of the drawn marks: ×, ‹, ›, the radio's ring (#272). */
  markStroke: mm(MM.markStroke.value),
  closeMark: mm(MM.closeMark.value),
  closeCentre: mm(MM.closeCentre.value),
  backMarkHeight: mm(MM.backMarkHeight.value),
  chevronHeight: mm(MM.chevronHeight.value),
  /** Between a row's value and its ›, and between the switch's word and its track (#272). */
  markGap: mm(MM.markGap.value),
  switchWidth: mm(MM.switchWidth.value),
  switchHeight: mm(MM.switchHeight.value),
  switchKnob: mm(MM.switchKnob.value),
  /** Between the switch's word and its track (#287). */
  switchWordGap: mm(MM.switchWordGap.value),
  radioSize: mm(MM.radioSize.value),
  radioDot: mm(MM.radioDot.value),
  smallButtonWidth: mm(MM.smallButtonWidth.value),
  smallButtonHeight: mm(MM.smallButtonHeight.value),
  iconSize: mm(MM.iconSize.value),
  pagerArrow: mm(MM.pagerArrow.value),
  pagerNumberGap: mm(MM.pagerNumberGap.value),
  /** The field's × that clears its text (#287). */
  clearMark: mm(MM.clearMark.value),
  /** The loading box over a note, as the native one (#287). */
  loadingWidth: mm(MM.loadingWidth.value),
  loadingPaddingV: mm(MM.loadingPaddingV.value),
  loadingPaddingH: mm(MM.loadingPaddingH.value),
  loadingIcon: mm(MM.loadingIcon.value),
  loadingIconGap: mm(MM.loadingIconGap.value),
  /** The static loading mark of a full view that loads, and its rays as shares of its size (#287). */
  loadingMark: mm(MM.loadingMark.value),
  loadingMarkGap: mm(MM.loadingMarkGap.value),
  loadingRayStart: RATIO.loadingRayStart.value,
  loadingRayLength: RATIO.loadingRayLength.value,
  loadingRayStroke: RATIO.loadingRayStroke.value,
  /** The code block's height as a share of the window's: about half the screen (#405). */
  codeBlockHeight: RATIO.codeBlockHeight.value,

  ink: COLOUR.ink.value,
  paper: COLOUR.paper.value,
  /** Section headings, hints and values: the context grey, 9.7:1 on paper (README › Grey as colour, #50). */
  context: COLOUR.context.value,
  /** The field's placeholder: a grey that keeps 7:1 contrast on paper (interface rule 3). */
  placeholder: COLOUR.placeholder.value,
  /** Selected text in the field: a light grey, so the ink text stays readable over it. */
  selection: COLOUR.selection.value,
} as const;

type TextRole = keyof typeof tokens.text;
type Font = keyof typeof MM;
type Colour = keyof typeof COLOUR;

/**
 * One text style per native role (#272), from tokens.json's `text` group, which Ink.java reads too:
 * its size and colour, and its font family where the role names one (the code block's, #405);
 * every native role is regular weight.
 */
export const textStyles = Object.fromEntries(
  Object.entries(tokens.text).map(([role, {value}]) => [
    role,
    {
      fontSize: mm(MM[value.font as Font].value),
      color: COLOUR[value.colour as Colour].value,
      ...('family' in value ? {fontFamily: value.family} : {}),
    },
  ]),
) as Record<TextRole, {fontSize: number; color: string; fontFamily?: string}>;
