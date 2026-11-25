/**
 * The renders (#80): every screen to .scratch/renders/ and the e-ink check, with the Jest setup
 * the unit tests use. Run with `npm run renders`; not part of `npm test`.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const base = require('../../jest.config');

/**
 * Playwright is installed globally with its Chromium, not in package.json, so the renders resolve
 * it from the global root, for any user, the gate user too (#90). A Mac without it uses a
 * throwaway copy, never a global install (#265): `npm install --prefix <tmp> playwright`, then
 * `PLAYWRIGHT_BROWSERS_PATH=<tmp>/browsers npx --prefix <tmp> playwright install chromium`, then
 * `NODE_PATH=<tmp>/node_modules PLAYWRIGHT_BROWSERS_PATH=<tmp>/browsers npm run renders`; Jest's
 * resolver reads NODE_PATH. Remove <tmp> afterwards.
 */
const globalRoot = execFileSync('npm', ['root', '-g'], {encoding: 'utf8'}).trim();

/**
 * shortcut: the cloud image keeps Playwright's Chromium in /opt/pw-browsers and sets
 * PLAYWRIGHT_BROWSERS_PATH only for root; upgrade when another machine shares a browser folder.
 */
const SHARED_BROWSERS = '/opt/pw-browsers';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(SHARED_BROWSERS)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = SHARED_BROWSERS;
}

module.exports = {
  ...base,
  rootDir: '../..',
  testMatch: ['<rootDir>/scripts/renders/*.render.tsx'],
  setupFiles: ['<rootDir>/scripts/renders/manta.ts'],
  // The plugin's own node_modules first, for the shared ui-kit package (#93).
  modulePaths: [...base.modulePaths, globalRoot],
  /** One test renders every screen: about 4 s idle, so 5 s timed out under load (#90). */
  testTimeout: 120000,
};
