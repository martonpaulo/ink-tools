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

  // The box that clips an element: its nearest ancestor that hides what runs past it, such as a
  // scroll view, a paged list or the screen, so a row cut at its list's end is found (#548, #578).
  const clipOf = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
        return boxOf(e.getBoundingClientRect());
      }
    }
    return undefined;
  };
  const rows = [...document.querySelectorAll(ROW)]
    .filter(shown)
    .map(el => ({name: nameOf(el), box: boxOf(el.getBoundingClientRect()), clip: clipOf(el)}));

  // Each scroll view whose content runs past its end, with the list rows inside it (#548).
  const scrolled = [...document.querySelectorAll('[data-scroll]')]
    .filter(el => shown(el) && !el.closest(CODE) && el.scrollHeight > el.clientHeight + 1)
    .map(el => ({name: `scroll view «${nameOf(el)}»`, rows: el.querySelectorAll(ROW).length}));

  // ui-kit's MediaFrame and its picture (#576), and every picture sized by aspectRatio instead.
  const media = [...document.querySelectorAll('[data-kind="media"]')]
    .filter(shown)
    .map(el => ({
      name: nameOf(el),
      box: boxOf(el.getBoundingClientRect()),
      frame: boxOf(el.closest('[data-kind="media-frame"]').getBoundingClientRect()),
    }));
  const looseImages = [...document.querySelectorAll('img[data-aspect]')]
    .filter(shown)
    .map(el => ({name: nameOf(el), box: boxOf(el.getBoundingClientRect())}));

  // Each radio's ring and the end of its list of radio rows (#546).
  const rings = [...document.querySelectorAll('[data-kind="radio-ring"]')]
    .filter(el => shown(el) && el.closest('[data-kind="radio-list"]'))
    .map(el => ({
      name: nameOf(el.closest('[data-kind="list-row"]') ?? el),
      box: boxOf(el.getBoundingClientRect()),
      list: boxOf(el.closest('[data-kind="radio-list"]').getBoundingClientRect()),
    }));

  // Each paged list's room for its parts, what they use of it, and how tall its first part and the
  // first row in it are, so a page left mostly empty is found (#594). The box holds the parts' view,
  // then the pager when more pages follow.
  const pagedPages = [...document.querySelectorAll('[data-kind="paged-list"]')]
    .filter(shown)
    .map(el => {
      const box = boxOf(el.getBoundingClientRect());
      const parts = [...(el.firstElementChild?.children ?? [])];
      const pager = el.children.length > 1 ? boxOf(el.children[1].getBoundingClientRect()) : undefined;
      const first = parts[0] ? boxOf(parts[0].getBoundingClientRect()) : undefined;
      const firstRow = parts[0]?.querySelector(ROW);
      const lastBottom = parts.reduce((low, part) => Math.max(low, boxOf(part.getBoundingClientRect()).bottom), box.top);
      return {
        name: nameOf(el),
        room: (pager ? pager.top : box.bottom) - box.top,
        used: lastBottom - box.top,
        // The first part down to the end of its first row: what must fit for the part to start here.
        start: first ? (firstRow ? boxOf(firstRow.getBoundingClientRect()).bottom : first.bottom) - first.top : 0,
        paged: Boolean(pager),
      };
    });

  // A text's contrast against the colour painted behind it, opacity included (#575).
  const rgba = (value) => {
    const n = (value.match(/-?[\d.]+/g) || []).map(Number);
    return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1];
  };
  const luminance = ([r, g, b]) => {
    const channel = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const behind = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const colour = rgba(getComputedStyle(e).backgroundColor);
      if (colour[3] > 0) {
        return colour;
      }
    }
    return [255, 255, 255, 1];
  };
  const contrastOf = (el) => {
    const back = behind(el);
    const fore = rgba(getComputedStyle(el).color);
    let alpha = fore[3];
    for (let e = el; e; e = e.parentElement) {
      alpha *= Number(getComputedStyle(e).opacity);
    }
    const mixed = [0, 1, 2].map(i => fore[i] * alpha + back[i] * (1 - alpha));
    const [high, low] = [luminance(mixed), luminance(back)].sort((x, y) => y - x);
    return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
  };

  // ui-kit's section caption box, by its SECTION_CAPTION_ID (#416).
  const captions = [...document.querySelectorAll('[data-kind="section-caption"]')]
    .filter(shown)
    .map(el => ({name: nameOf(el), box: boxOf(el.getBoundingClientRect())}));

  // ui-kit's list of radio rows, by its RADIO_LIST_ID (#299).
  const radioLists = [...document.querySelectorAll('[data-kind="radio-list"]')]
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
      // The lines the text wraps to: the words' distinct tops, a fraction of a unit apart being one line (#543).
      const tops = [];
      for (const rect of words) {
        if (!tops.some(top => Math.abs(top - rect.top) < rect.height / 2)) {
          tops.push(rect.top);
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
        // The code block's box, so a line that runs past its side is caught: lines wrap (#405).
        codeBox: el.closest(CODE) ? boxOf(el.closest(CODE).getBoundingClientRect()) : undefined,
        lines: tops.length,
        // The button the text is the label of, by its ui-kit kind (a button's level), if any (#543).
        button: el.closest('[data-kind^="button-"]') ? nameOf(el.closest('[data-kind^="button-"]')) : undefined,
        monospace: /monospace/i.test(getComputedStyle(el).fontFamily),
        within,
        scroll: scrollOf(el),
        bar: inBar(el),
        // A disabled control's text is exempt, as interface rule 3 and WCAG 1.4.3 say (#575).
        contrast: el.closest('[aria-disabled="true"]') ? undefined : contrastOf(el),
      };
    });
  return {screen: boxOf(root.getBoundingClientRect()), targets, texts, scrolls, bars, rows, captions, radioLists, scrolled, media, looseImages, rings, pagedPages};
}
