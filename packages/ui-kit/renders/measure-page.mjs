// Measures a rendered screen for rules.ts (#80): runs inside the page, so it is plain JavaScript
// that Babel never rewrites, read as text and evaluated by renders.render.tsx. Returns Measured.
/**
 * Self-contained, no import. Hidden elements
 * (no box, opacity 0) and elements that take no touch (pointer-events none) are left out, as the
 * person cannot see or tap them; the text of a field scrolls inside it and is left out too.
 */
export function measurePage() {
  const shown = (el) => {
    if (!el.getClientRects().length) {
      return false;
    }
    for (let e = el; e; e = e.parentElement) {
      if (Number(getComputedStyle(e).opacity) === 0) {
        return false;
      }
    }
    return true;
  };
  const nameOf = (el) =>
    el.getAttribute('data-name') ||
    (el.textContent ?? '').trim().slice(0, 40) ||
    el.getAttribute('data-type') ||
    'element';
  // Boxes in layout units: the root's zoom draws each unit as several pixels.
  const root = document.getElementById('root');
  const zoom = Number(getComputedStyle(root).zoom) || 1;
  const boxOf = (rect) => ({
    left: rect.left / zoom,
    top: rect.top / zoom,
    right: rect.right / zoom,
    bottom: rect.bottom / zoom,
  });
  // The native title bar draws its own insets, so what sits in it is held to the edges, not the
  // padding (#309); the band's testID is ui-kit's TITLE_BAR_ID.
  const BAR = '[data-name="title-bar"]';
  const inBar = (el) => Boolean(el.closest(BAR));
  // Content of a sideways scroll view runs past its sides, as the person scrolls to it: what shows
  // is the part inside it, so each box is held to its sides (#405).
  const shownX = (el, box) => {
    const side = el.parentElement?.closest('[data-scroll-x]');
    if (!side) {
      return box;
    }
    const edge = boxOf(side.getBoundingClientRect());
    return {...box, left: Math.max(box.left, edge.left), right: Math.min(box.right, edge.right)};
  };
  // ui-kit's list row, by its LIST_ROW_ID (#411).
  const ROW = '[data-kind="list-row"]';
  const scrollOf = (el) => {
    const view = el.parentElement?.closest('[data-scroll]');
    return view ? shownX(view, boxOf(view.getBoundingClientRect())) : undefined;
  };
  // ui-kit's CodeBlock, the one place raw text shows (#405); its testID is ui-kit's CODE_BLOCK_ID.
  const CODE = '[data-name="code-block"]';

  const scrolls = [...document.querySelectorAll('[data-scroll]')]
    .filter(shown)
    .map(el => ({
      name: `scroll view «${nameOf(el)}»`,
      box: shownX(el, boxOf(el.getBoundingClientRect())),
    }));

  const targets = [...document.querySelectorAll('[data-target]')]
    .filter(el => shown(el) && getComputedStyle(el).pointerEvents !== 'none')
    .map(el => {
      const rect = el.getBoundingClientRect();
      return {
        name: nameOf(el),
        width: rect.width / zoom,
        height: rect.height / zoom,
        box: boxOf(rect),
        scroll: scrollOf(el),
        bar: inBar(el),
        // The ui-kit kind (a button's level, a list row) and whether it sits in a list row (#411).
        kind: el.getAttribute('data-kind') ?? undefined,
        inRow: Boolean(el.parentElement?.closest(ROW)),
      };
    });

  const rows = [...document.querySelectorAll(ROW)]
    .filter(shown)
    .map(el => ({name: nameOf(el), box: boxOf(el.getBoundingClientRect())}));

  const bars = [...document.querySelectorAll(BAR)]
    .filter(shown)
    .map(el => ({name: 'the title bar', box: boxOf(el.getBoundingClientRect())}));

  const texts = [...document.querySelectorAll('.text')]
    .filter(el => shown(el) && (el.textContent ?? '').trim() !== '')
    .map(el => {
      // The glyphs are the words: a space Chromium hangs past a line's end draws nothing (#284).
      const words = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          words.push(...range.getClientRects());
        }
      }
      const glyphs = words.reduce((all, rect) => ({
        left: Math.min(all.left, rect.left),
        top: Math.min(all.top, rect.top),
        right: Math.max(all.right, rect.right),
        bottom: Math.max(all.bottom, rect.bottom),
      }));
      const within = [];
      const scroll = el.closest('[data-scroll]');
      const end = scroll ?? root.parentElement;
      for (let e = el; e && e !== end; e = e.parentElement) {
        within.push({
          name: e === root ? 'the screen' : `«${nameOf(e)}»`,
          box: boxOf(e.getBoundingClientRect()),
        });
      }
      // The smallest size of the text and the nested texts inside it, in layout units.
      const fontSize = Math.min(
        ...[el, ...el.querySelectorAll('.inner')].map(e =>
          parseFloat(getComputedStyle(e).fontSize),
        ),
      );
      return {
        name: nameOf(el),
        text: (el.textContent ?? '').trim(),
        fontSize,
        glyphs: shownX(el, boxOf(glyphs)),
        code: Boolean(el.closest(CODE)),
        monospace: /monospace/i.test(getComputedStyle(el).fontFamily),
        within,
        scroll: scrollOf(el),
        bar: inBar(el),
      };
    });
  return {screen: boxOf(root.getBoundingClientRect()), targets, texts, scrolls, bars, rows};
}
