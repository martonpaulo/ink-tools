/**
 * The e-ink rules a rendered screen is checked against (brief section 8.4, #80): every target the
 * person taps is at least the touch target on both sides, no text is smaller than the minimum font
 * size (#85), no text runs outside its own box, the boxes around it or the screen, and every
 * target and text stays inside the screen padding, so nothing touches the edge (#97). Content inside
 * a scroll view may run below the screen, as the person scrolls to it; the scroll view itself
 * keeps the padding, so a row lost below the screen and a scrolling list are told apart (#265).
 * The title bar is the one exception: it touches the top, left and right edges, as NOTE's native
 * band does, and what sits in it keeps the bar's own insets instead of the padding (#309), and
 * every full view has one (#311). Raw text, such as a log, shows only in ui-kit's CodeBlock (#405).
 * measure-page.mjs measures the page; contrast is checked in the page by the shared
 * contrast-check.mjs; animation from the host tree (html.ts).
 */

export type Box = {left: number; top: number; right: number; bottom: number};

export type Measured = {
  /** The screen's box. */
  screen: Box;
  /** Every visible element the person can tap; `scroll` is the scroll view it sits in. */
  targets: {
    name: string;
    width: number;
    height: number;
    box: Box;
    scroll?: Box;
    bar?: boolean;
    /** The ui-kit kind, from the component's `nativeID`: a button's level, the bar's action, a row. */
    kind?: string;
    /** True when the target sits inside a list row. */
    inRow?: boolean;
  }[];
  /**
   * Every visible text: its smallest font size in units, the box of its glyphs, and the boxes it
   * must stay inside, up to the scroll view it sits in, if any.
   */
  texts: {
    name: string;
    text: string;
    fontSize: number;
    glyphs: Box;
    within: {name: string; box: Box}[];
    scroll?: Box;
    /** True inside the title bar. */
    bar?: boolean;
    /** True inside ui-kit's CodeBlock (#405). */
    code?: boolean;
    /** The box of the code block the text sits in (#405). */
    codeBox?: Box;
    /** True when drawn in a monospaced face. */
    monospace?: boolean;
  }[];
  /** Every visible scroll view, by its visible box. */
  scrolls: {name: string; box: Box}[];
  /** Every visible title bar, by its box. */
  bars: {name: string; box: Box}[];
  /** Every visible ui-kit list row, by its box (#411). */
  rows: {name: string; box: Box}[];
  /** Every visible section caption's box, ui-kit's `SECTION_CAPTION_ID` (#416). */
  captions: {name: string; box: Box}[];
  /** Every visible list of radio rows, ui-kit's `RADIO_LIST_ID` (#299). */
  radioLists: {name: string; box: Box}[];
};

/** A rendered edge may land a fraction of a unit off; a real break is larger. */
const TOLERANCE = 0.5;

/** The sizes, in layout units, a screen must keep (the tokens of packages/ui-kit). */
export type Limits = {touchTarget: number; minFont: number; screenPadding: number};

/** True when `inner` reaches past `outer` by more than the tolerance. */
const outside = (inner: Box, outer: Box) =>
  inner.left + TOLERANCE < outer.left ||
  inner.top + TOLERANCE < outer.top ||
  inner.right - TOLERANCE > outer.right ||
  inner.bottom - TOLERANCE > outer.bottom;

/** True when `a` and `b` share more than the tolerance on both axes. */
const overlap = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOLERANCE &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOLERANCE;

const sameBox = (a: Box, b: Box) => !outside(a, b) && !outside(b, a);

/**
 * The scroll breaks of a screen measured with every scroll view at its end (#279): the last
 * target of each scroll view shows wholly inside it, so scrolling reaches it, and no target
 * outside a scroll view, such as a «Close» row, lies over it.
 */
export function scrollBreaks(measured: Measured): string[] {
  const found: string[] = [];
  for (const scroll of measured.scrolls) {
    const inside = measured.targets.filter(t => t.scroll && sameBox(t.scroll, scroll.box));
    const last = inside.reduce<(typeof inside)[number] | null>(
      (lowest, t) => (lowest && lowest.box.bottom >= t.box.bottom ? lowest : t),
      null,
    );
    if (last && outside(last.box, scroll.box)) {
      found.push(`«${last.name}», the last target of ${scroll.name}, stays hidden at its end`);
    }
    for (const target of measured.targets) {
      if (!target.scroll && overlap(target.box, scroll.box)) {
        found.push(`«${target.name}» lies over ${scroll.name}`);
      }
    }
  }
  return found;
}

/** The title bars that do not touch the screen's top, left and right edges (#309). */
export function barBreaks({screen, bars}: Pick<Measured, 'screen' | 'bars'>): string[] {
  return bars.flatMap(({name, box}) => {
    const off = (['top', 'left', 'right'] as const).filter(edge => Math.abs(box[edge] - screen[edge]) > TOLERANCE);
    return off.length ? [`${name} does not touch the screen's ${off.join(', ')} edge`] : [];
  });
}

/**
 * A full view with no title bar (#311): every plugin full view opens with ui-kit's TitleBar, as
 * NOTE's native screens do. A screen that is no full view, such as the working strip, says so in
 * its render line instead.
 */
export function missingBarBreaks({bars}: Pick<Measured, 'bars'>): string[] {
  return bars.length ? [] : ["has no title bar: a full view opens with ui-kit's TitleBar"];
}

/**
 * Raw text shown outside ui-kit's CodeBlock (#405): every line of `raw`, the code, JSON or log the
 * screen was fed, must show inside the block, and only the block draws a monospaced face.
 */
export function rawBreaks({texts}: Pick<Measured, 'texts'>, raw: readonly string[] = []): string[] {
  const lines = new Set(raw.map(line => line.trim()));
  return texts.flatMap(({text, code, codeBox, glyphs, monospace}) => {
    if (code) {
      // The block scrolls up and down only: a long line wraps inside its sides (owner, #405).
      const past = codeBox && (glyphs.left + TOLERANCE < codeBox.left || glyphs.right - TOLERANCE > codeBox.right);
      return past ? [`code line «${text.slice(0, 60)}» runs past the code block's side: its lines wrap`] : [];
    }
    if (lines.has(text)) {
      return [`raw text «${text.slice(0, 60)}» shows outside ui-kit's CodeBlock`];
    }
    return monospace ? [`text «${text.slice(0, 60)}» is monospaced outside ui-kit's CodeBlock`] : [];
  });
}

/** Every rule break of one measured screen, as one readable line each. */
export function breaksOf(
  measured: Measured,
  {touchTarget, minFont, screenPadding}: Limits,
): string[] {
  const found: string[] = [];
  const {screen} = measured;
  const inside: Box = {
    left: screen.left + screenPadding,
    top: screen.top + screenPadding,
    right: screen.right - screenPadding,
    bottom: screen.bottom - screenPadding,
  };
  // Scrolled content is held to the padding on its sides only: it scrolls up into view. The title
  // bar and what sits in it are held to the edges instead, which barBreaks checks.
  const reach = ({box, scroll, bar}: {box: Box; scroll?: Box; bar?: boolean}) =>
    !bar && outside(box, scroll ? {...inside, top: box.top, bottom: box.bottom} : inside);
  // A target and the text inside it are named once.
  const intruders = new Set(
    [
      ...measured.scrolls,
      ...measured.targets,
      ...measured.texts.map(({text, glyphs, scroll, bar}) => ({
        name: text.slice(0, 60),
        box: glyphs,
        scroll,
        bar,
      })),
    ]
      .filter(reach)
      .map(({name}) => name),
  );
  found.push(...barBreaks(measured));
  for (const name of intruders) {
    found.push(`«${name}» reaches into the screen padding`);
  }
  for (const target of measured.targets) {
    if (target.width + TOLERANCE < touchTarget || target.height + TOLERANCE < touchTarget) {
      found.push(
        `target «${target.name}» is ${Math.round(target.width)} x ${Math.round(
          target.height,
        )} units, under ${touchTarget}`,
      );
    }
  }
  for (const text of measured.texts) {
    if (text.fontSize + TOLERANCE < minFont) {
      found.push(
        `text «${text.text.slice(0, 60)}» is ${text.fontSize} units, under ${minFont}`,
      );
    }
    const around = text.within.find(({box}) => outside(text.glyphs, box));
    if (around) {
      found.push(`text «${text.text.slice(0, 60)}» runs outside ${around.name}`);
    }
  }
  return found;
}

/** The native sizes a screen keeps to (#272, #411): the text roles' sizes, the row's height and inset. */
export type Native = {
  /** Every font size a native text role has; a text of another size breaks the type scale. */
  textSizes: number[];
  rowHeight: number;
  screenPadding: number;
  /** On a list of radio rows, from its end to the screen's other edge (#299). */
  radioListTrailingMargin: number;
  /** The height two screen-level actions stay within, so they read as one place. */
  actionSpread: number;
};

/** The button levels (ui-kit `buttonId`) and the bar's action (`BAR_ACTION_ID`). */
const SCREEN_ACTIONS = ['button-primary', 'button-destructive', 'bar-action'];

/**
 * The native Settings rules a screen keeps (#411): one button hierarchy, where only a destructive
 * button spans the width, a row action sits in a row and a row holds no other button; the
 * screen-level actions in one place; text only in a native role's size; each list row at the
 * native height, starting at the native inset; a list of radio rows ending at the native radio
 * list's trailing margin (#299); and a caption that is the first part under the title
 * bar starts its box at the bar's bottom line (#416).
 */
export function nativeBreaks(measured: Measured, native: Native): string[] {
  const found: string[] = [];
  const {screen} = measured;
  const content = screen.right - screen.left - 2 * native.screenPadding;
  for (const target of measured.targets) {
    const {kind, name} = target;
    if (!kind?.startsWith('button-')) {
      continue;
    }
    if (kind !== 'button-destructive' && target.width + TOLERANCE >= content) {
      found.push(`button «${name}» spans the width: only a destructive button does; a row's action is an ActionRow`);
    }
    if (kind === 'button-row' && !target.inRow) {
      found.push(`row action «${name}» stands outside a list row`);
    }
    if (kind !== 'button-row' && target.inRow) {
      found.push(`button «${name}» sits in a list row: a row's action is kind «row»`);
    }
  }
  const actions = measured.targets.filter(t => t.kind && SCREEN_ACTIONS.includes(t.kind));
  for (const a of actions) {
    for (const b of actions) {
      if (a !== b && a.box.top < b.box.top && b.box.top - a.box.bottom > native.actionSpread) {
        found.push(`screen actions «${a.name}» and «${b.name}» stand apart: put them in one place`);
      }
    }
  }
  const sizes = native.textSizes.map(size => size.toFixed(1));
  for (const text of measured.texts) {
    if (!native.textSizes.some(size => Math.abs(size - text.fontSize) <= TOLERANCE)) {
      found.push(
        `text «${text.text.slice(0, 60)}» is ${text.fontSize} units, no native text role (${sizes.join(', ')})`,
      );
    }
  }
  for (const row of measured.rows) {
    if (row.box.bottom - row.box.top + TOLERANCE < native.rowHeight) {
      found.push(`row «${row.name.slice(0, 40)}» is under the native row height ${native.rowHeight}`);
    }
    if (Math.abs(row.box.left - (screen.left + native.screenPadding)) > TOLERANCE) {
      found.push(`row «${row.name.slice(0, 40)}» starts off the native inset ${native.screenPadding}`);
    }
  }
  for (const list of measured.radioLists) {
    const margin = screen.right - list.box.right;
    if (Math.abs(margin - native.radioListTrailingMargin) > TOLERANCE) {
      found.push(
        `radio list «${list.name.slice(0, 40)}» ends ${margin} from the edge, not the native ${native.radioListTrailingMargin}`,
      );
    }
  }
  found.push(...firstCaptionBreaks(measured));
  return found;
}

/**
 * A caption that is the first part under a title bar, with no row or text between them, whose box
 * does not start at the bar's bottom line, as the native Settings caption does (#416).
 */
export function firstCaptionBreaks({bars, captions, rows, texts}: Measured): string[] {
  return bars.flatMap(bar => {
    const first = captions
      .filter(caption => caption.box.bottom > bar.box.bottom + TOLERANCE)
      .sort((a, b) => a.box.top - b.box.top)[0];
    if (!first) {
      return [];
    }
    // The caption's own text lies inside its box, so it never counts as a part above it.
    const between = [...rows.map(row => row.box), ...texts.filter(text => !text.bar).map(text => text.glyphs)].some(
      part => part.top + TOLERANCE >= bar.box.bottom && part.bottom - TOLERANCE <= first.box.top,
    );
    const off = Math.abs(first.box.top - bar.box.bottom);
    return !between && off > TOLERANCE
      ? [`caption «${first.name}» starts ${Math.round(off)} units off the title bar's bottom: its box starts at the bar`]
      : [];
  });
}
