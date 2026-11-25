// Renders each lasso button icon, assets/<name>.svg, to the 96 x 96 PNG the button registers
// (#107; one size per button, owner D43 A), Image Editing's lasso icon the same way, each plugin
// icon, assets/icon.svg, that `PluginConfig.json` names (#248), and
// assets/contact-sheet.png: every icon at 96 px and at the lasso list's 60 px, with Device Transfer's
// and Image Editing's lasso icons beside them for the shared style.
// Chromium (Playwright, as Ink2Pic's `npm run icon`) draws each SVG, so a PNG never drifts from it.
// Run: `npm run icons`, with Playwright on NODE_PATH.
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');

const assets = path.join(__dirname, '..', 'assets');
const plugins = path.join(__dirname, '..', '..');
const transferAssets = path.join(plugins, 'device-transfer', 'assets');
const editingAssets = path.join(plugins, 'image-editing', 'assets');
const BUTTON_PX = 96;
const LIST_PX = 60;
const SHEET_WIDTH = 760;
const TRANSFER_LASSO = ['send-selection.svg', 'send-text.svg'];

const svgsIn = dir => fs.readdirSync(dir).filter(file => file.endsWith('.svg')).sort();
const svgs = svgsIn(assets);
const editingSvgs = svgsIn(editingAssets);

function cell(dir, file, plugin) {
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  return `<figure><div class="big">${svg}</div><div class="list">${svg}</div><figcaption>${plugin}<br>${file.replace('.svg', '')}</figcaption></figure>`;
}

/** A screenshot of `html`; a button icon keeps a transparent page, the sheet a white one. */
async function shot(browser, html, {width, height, file, transparent}) {
  const page = await browser.newPage({viewport: {width, height}});
  await page.setContent(html);
  await page.screenshot({path: file, omitBackground: transparent, fullPage: !transparent});
  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    const buttons = [
      ...svgs.map(file => [assets, file]),
      ...editingSvgs.map(file => [editingAssets, file]),
      // Device Transfer's plugin icon (#248); its button icons are drawn by hand.
      [transferAssets, 'icon.svg'],
    ];
    for (const [dir, file] of buttons) {
      const svg = fs.readFileSync(path.join(dir, file), 'utf8');
      const png = path.join(dir, file.replace('.svg', '.png'));
      await shot(
        browser,
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${BUTTON_PX}px;height:${BUTTON_PX}px}</style>${svg}`,
        {width: BUTTON_PX, height: BUTTON_PX, file: png, transparent: true},
      );
      console.log(`rendered ${path.relative(plugins, png)} (${BUTTON_PX} x ${BUTTON_PX})`);
    }
    const cells = [
      ...svgs.map(file => cell(assets, file, 'Word Lookup')),
      ...TRANSFER_LASSO.map(file => cell(transferAssets, file, 'Device Transfer')),
      ...editingSvgs.map(file => cell(editingAssets, file, 'Image Editing')),
    ].join('');
    await shot(
      browser,
      `<style>body{margin:16px;background:#fff;color:#000;font:13px sans-serif;display:flex;flex-wrap:wrap;gap:20px}figure{margin:0;width:120px;text-align:center}.big svg{width:${BUTTON_PX}px;height:${BUTTON_PX}px}.list svg{width:${LIST_PX}px;height:${LIST_PX}px}</style>${cells}`,
      {width: SHEET_WIDTH, height: LIST_PX, file: path.join(assets, 'contact-sheet.png'), transparent: false},
    );
    console.log('rendered assets/contact-sheet.png');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
