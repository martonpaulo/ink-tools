/**
 * The renders (#80): every screen to .scratch/renders/ and the e-ink check. They live with ui-kit,
 * whose tokens they check, and run from Account Sync's node_modules, as ui-kit's own tests do
 * (#93, #288): `npm -C plugins/account-sync run renders`. Not part of `npm test`.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const inkCore = require('../../ink-core/plugin-config');
const snAdapter = require('../../sn-adapter/plugin-config');
const pictureSearch = require('../../picture-search/plugin-config');
const puzzleCore = require('../../puzzle-core/plugin-config');

/** The plugin whose React Native, Jest setup and node_modules the renders use. */
const HOST = path.join(__dirname, '../../../plugins/account-sync');
const base = require(path.join(HOST, 'jest.config'));

/**
 * Playwright is installed globally with its Chromium, not in package.json, so the renders resolve
 * it from the global root, for any user, the gate user too (#90). A Mac without it uses a
 * throwaway copy, never a global install (#265): `npm install --prefix <tmp> playwright`, then
 * `PLAYWRIGHT_BROWSERS_PATH=<tmp>/browsers npx --prefix <tmp> playwright install chromium`, then
 * `NODE_PATH=<tmp>/node_modules PLAYWRIGHT_BROWSERS_PATH=<tmp>/browsers npm run renders`; Jest's
 * resolver reads NODE_PATH. Remove <tmp> afterwards. The owner's Mac keeps one such copy for every
 * lane in the main checkout's ignored `.scratch/pw255/` (its `node_modules` and `browsers`), so a
 * lane, from any worktree, sets NODE_PATH to `<main checkout>/.scratch/pw255/node_modules` and
 * PLAYWRIGHT_BROWSERS_PATH to `<main checkout>/.scratch/pw255/browsers` before
 * `RENDER_EVIDENCE=<dir> npm -C plugins/account-sync run renders`, and keeps the copy.
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
  rootDir: HOST,
  roots: [__dirname],
  testMatch: [path.join(__dirname, '*.render.tsx')],
  setupFiles: [path.join(__dirname, 'manta.ts')],
  // The host's own node_modules first, for the shared ui-kit package (#93).
  // NODE_PATH too, for the throwaway Playwright copy above: a config that sets modulePaths makes
  // Jest ignore NODE_PATH, so it is read here (#386).
  modulePaths: [...base.modulePaths, globalRoot, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
  // Every plugin's view renders with the host's one React and React Native, as the ui-kit package
  // does (#253): its own node_modules would load a second copy.
  moduleNameMapper: {
    ...base.moduleNameMapper,
    ...inkCore.jestModuleNameMapper,
    ...snAdapter.jestModuleNameMapper,
    ...pictureSearch.jestModuleNameMapper,
    ...puzzleCore.jestModuleNameMapper,
    '^sn-plugin-lib$': snAdapter.jestSdkMock,
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-native$': '<rootDir>/node_modules/react-native',
  },
  /** One test renders every screen: about 4 s idle, so 5 s timed out under load (#90). */
  testTimeout: 120000,
};
