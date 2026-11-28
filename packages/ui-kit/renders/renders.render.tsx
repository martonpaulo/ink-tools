/**
 * Renders every screen as the Manta shows it, 1920 x 2560 px in 16 grey levels, to
 * .scratch/renders/<screen>.png, and fails on any e-ink rule break (brief section 8.4, #80):
 * text contrast under the floor, a target under the touch target, text under the minimum font
 * size (#85), text outside its box, animation, a scroll view whose last target stays hidden
 * or lies under another target (#279), a title bar that does not touch the top, left and right edges (#309), or a full view with no title bar (#311), raw text outside ui-kit's CodeBlock (#405), or a break of native Settings (#411): a full-width button
 * that is no destructive one, a row action outside a row, two screen actions apart, a text size no
 * native role has, a list row off the native height or inset. Run with `npm run renders` before each device
 * build; RENDER_SCALE=1 renders 1024 x 1365 px pictures for a quick look; RENDER_WINDOW=nomad or
 * turned renders the Nomad's window or the Manta turned, into a subfolder. Uses the Chromium installed with Playwright.
 * RENDER_EVIDENCE=<folder> also writes each screen as <screen>-light-<small|default|large>.png there, the
 * renders `render_evidence.py check` asks of an interface change (the Workbench's #1727).
 */
import fs from 'fs';
import path from 'path';
import {act} from 'react-test-renderer';
import {metrics} from '@ink-tools/ui-kit';
import {textStyles} from '../src/metrics';
import {NEXT_PAGE_LABEL} from '../src/controlsCopy';
import {PAGED_LIST_ID} from '../src/PagedList';
import {animationBreaks, toHtml, WINDOW, WINDOW_NAME} from './html';
import {breaksOf, layoutBreaks, Measured, missingBarBreaks, Native, nativeBreaks, rawBreaks, scrollBreaks} from './rules';
import {SCREENS as PLUGIN_SCREENS, settle} from './screens';
import {KIT_SCREENS} from './kitScreens';
import type {ReactTestRenderer} from 'react-test-renderer';

const SCREENS = [...KIT_SCREENS, ...PLUGIN_SCREENS];

/** The native sizes from the tokens (#272, #411): every text role's size, a screen's own title and the large glyphs. */
const NATIVE: Native = {
  textSizes: [...new Set([...Object.values(textStyles).map(style => style.fontSize), metrics.fontTitle, metrics.fontLarge])],
  rowHeight: metrics.rowHeight,
  screenPadding: metrics.screenPadding,
  radioListTrailingMargin: metrics.radioListTrailingMargin,
  actionSpread: metrics.rowHeight,
};

/** The few Playwright calls used here; Playwright is installed with Chromium, not in package.json. */
type Page = {
  setContent: (html: string, options: {waitUntil: 'load'}) => Promise<void>;
  evaluate: <T>(expression: string) => Promise<T>;
  screenshot: (options: {path: string}) => Promise<void>;
  setViewportSize: (size: {width: number; height: number}) => Promise<void>;
};
type Browser = {
  newPage: (options: object) => Promise<Page>;
  close: () => Promise<void>;
};
const {chromium} = require('playwright') as {
  chromium: {launch: () => Promise<Browser>};
};

/** The Manta's renders in the folder itself, another window's in its own subfolder (#279). */
const OUT = path.join(
  __dirname,
  '../../../.scratch/renders',
  WINDOW_NAME === 'manta' ? '' : WINDOW_NAME,
);
const MANTA_SCALE = 1.875;
const scale = Number(process.env.RENDER_SCALE ?? MANTA_SCALE);
/**
 * The evidence sizes (a folder in RENDER_EVIDENCE): the Nomad's 1404 px, the Manta's 1920 px, and
 * a 2560 px picture to read the smallest text. The e-ink screen has one appearance, light.
 * shortcut: the layout window stays 1024 px wide at every size, since the plugin view is one
 * width on both tablets; upgrade when a view lays out by screen width.
 */
const EVIDENCE = process.env.RENDER_EVIDENCE;
const EVIDENCE_SCALES = {small: 1404 / WINDOW.width, default: MANTA_SCALE, large: 2560 / WINDOW.width};
/**
 * A function that runs in the page, read as text so Babel never rewrites it: the shared
 * rendered-contrast check (interface standard rule 3), copied unchanged, and the measurer.
 */
const inPage = (file: string, name: string, args = '') =>
  `(() => { ${fs
    .readFileSync(path.join(__dirname, file), 'utf8')
    .replace(`export function ${name}`, `function ${name}`)}; return ${name}(${args}); })()`;
const MEASURE = inPage('measure-page.mjs', 'measurePage');
const CONTRAST = inPage('contrast-check.mjs', 'contrastCheck', '{focusRings: false}');
/** Each view's box that lays out by its measured box, in document order (#548). */
const LAYOUT_BOXES = `[...document.querySelectorAll('[data-layout]')].map(el => {
  const zoom = Number(getComputedStyle(document.getElementById('root')).zoom) || 1;
  const r = el.getBoundingClientRect();
  return {x: r.left / zoom, y: r.top / zoom, width: r.width / zoom, height: r.height / zoom};
})`;
/** Enough rounds for a paged list to measure its box, then its rows (#548). */
const LAYOUT_ROUNDS = 8;
/**
 * The known breaks of the layout rules (#548, #576, #578) on screens another lane adopts the
 * shared pieces on: each line stays until its screen is fixed, and the list only shrinks.
 */
const KNOWN: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'known-breaks.json'), 'utf8'),
).screens;
/** The pages of one screen the renders turn to, at most (#548). */
const MAX_PAGES = 6;
const SCROLL_TO_END =
  "document.querySelectorAll('[data-scroll]').forEach(el => { el.scrollTop = el.scrollHeight; })";

type ContrastResult = {
  failures: {kind: string; text?: string; ratio: number; required: number}[];
  unmeasured: {kind: string; selector: string; reason: string}[];
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  if (EVIDENCE) {
    fs.mkdirSync(EVIDENCE, {recursive: true});
  }
  browser = await chromium.launch();
  page = await browser.newPage({
    viewport: {
      width: Math.round(WINDOW.width * scale),
      height: Math.round(WINDOW.height * scale),
    },
    deviceScaleFactor: 1,
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(async () => {
  await browser?.close();
  jest.restoreAllMocks();
});

/**
 * Lays the screen out as the device does (#548): the test renderer has no layout, so each view
 * with an onLayout gets its box from Chromium, and the screen is drawn again until nothing moves.
 */
async function laidOut(tree: ReactTestRenderer) {
  let json = tree.toJSON();
  for (let round = 0; round < LAYOUT_ROUNDS; round++) {
    await page.setContent(toHtml(json, scale), {waitUntil: 'load'});
    const hosts = tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onLayout === 'function');
    if (!hosts.length) {
      break;
    }
    const boxes = await page.evaluate<{x: number; y: number; width: number; height: number}[]>(LAYOUT_BOXES);
    await act(async () => {
      hosts.forEach((host, index) => boxes[index] && host.props.onLayout({nativeEvent: {layout: boxes[index]}}));
    });
    const next = tree.toJSON();
    if (JSON.stringify(next) === JSON.stringify(json)) {
      break;
    }
    json = next;
  }
  return json;
}

it('renders every screen and finds no e-ink rule break (#80)', async () => {
  const report: Record<string, string[]> = {};
  /** Every target's box per screen, to compare a layout change before and after (#97). */
  const geometry: Record<string, Measured['targets']> = {};
  for (const screen of SCREENS) {
    if (screen.skip?.windows.includes(WINDOW_NAME)) {
      process.stdout.write(`renders: skip ${screen.name} at ${WINDOW_NAME}: ${screen.skip.reason}\n`);
      continue;
    }
    const tree = await screen.render();
    const json = await laidOut(tree);
    await page.setContent(toHtml(json, scale), {waitUntil: 'load'});
    await page.screenshot({path: path.join(OUT, `${screen.name}.png`)});
    if (EVIDENCE) {
      for (const [size, sized] of Object.entries(EVIDENCE_SCALES)) {
        await page.setViewportSize({
          width: Math.round(WINDOW.width * sized),
          height: Math.round(WINDOW.height * sized),
        });
        await page.setContent(toHtml(json, sized), {waitUntil: 'load'});
        await page.screenshot({
          path: path.join(EVIDENCE, `${screen.name}-light-${size}.png`),
        });
      }
      await page.setViewportSize({
        width: Math.round(WINDOW.width * scale),
        height: Math.round(WINDOW.height * scale),
      });
      await page.setContent(toHtml(json, scale), {waitUntil: 'load'});
    }
    const measured = await page.evaluate<Measured>(MEASURE);
    geometry[screen.name] = measured.targets;
    const contrast = await page.evaluate<ContrastResult>(CONTRAST);
    report[screen.name] = [
      ...animationBreaks(json),
      ...breaksOf(measured, metrics),
      ...nativeBreaks(measured, NATIVE),
      ...(screen.notFullView ? [] : missingBarBreaks(measured)),
      ...rawBreaks(measured, screen.raw),
      ...layoutBreaks(measured, metrics),
      ...contrast.failures.map(
        f => `contrast ${f.ratio}:1 under ${f.required}:1 for «${f.text ?? f.kind}»`,
      ),
      ...contrast.unmeasured.map(u => `contrast not measured: ${u.reason}`),
    ];
    if (measured.scrolls.length) {
      // The rows below the screen, for the eye check: each scroll view at its end (#265), where
      // its last target must show, with nothing over it (#279).
      await page.evaluate(SCROLL_TO_END);
      await page.screenshot({path: path.join(OUT, `${screen.name}-end.png`)});
      report[screen.name].push(
        ...scrollBreaks(await page.evaluate<Measured>(MEASURE)),
      );
    }
    // Every later page of a paged list, checked as the first (#548): its next arrow pressed.
    for (let shown = 2; shown <= MAX_PAGES; shown++) {
      const next = tree.root
        .findAll(node => node.props.testID === PAGED_LIST_ID)
        .flatMap(list =>
          list.findAll(node => node.props.accessibilityLabel === NEXT_PAGE_LABEL && typeof node.props.onPress === 'function' && !node.props.disabled),
        )[0];
      if (!next) {
        break;
      }
      await act(async () => next.props.onPress());
      const turned = await laidOut(tree);
      await page.setContent(toHtml(turned, scale), {waitUntil: 'load'});
      await page.screenshot({path: path.join(OUT, `${screen.name}-p${shown}.png`)});
      const later = await page.evaluate<Measured>(MEASURE);
      report[screen.name].push(
        ...[...breaksOf(later, metrics), ...nativeBreaks(later, NATIVE), ...layoutBreaks(later, metrics)].map(line => `page ${shown}: ${line}`),
      );
    }
    await act(async () => {
      tree.unmount();
      settle();
    });
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  fs.writeFileSync(path.join(OUT, 'geometry.json'), `${JSON.stringify(geometry, null, 1)}\n`);
  // A known break is reported apart; one that no longer happens must leave the list (#548).
  const known = new Set(Object.entries(KNOWN).flatMap(([name, found]) => found.map(line => `${name}: ${line}`)));
  const all = Object.entries(report).flatMap(([name, found]) => found.map(line => `${name}: ${line}`));
  const lines = [
    ...all.filter(line => !known.has(line)),
    ...[...known].filter(line => !all.includes(line)).map(line => `fixed, remove from known-breaks.json: ${line}`),
  ];
  if (known.size) {
    process.stdout.write(`renders: ${known.size} known breaks wait in known-breaks.json\n`);
  }
  process.stdout.write(
    `renders: ${SCREENS.length} screens in ${OUT}\n${lines.join('\n') || 'renders: no e-ink rule break'}\n`,
  );
  expect(lines).toEqual([]);
});
