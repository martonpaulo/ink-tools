/** The version rule (#155): the tablet's versionName is derived from package.json. */
import {join} from 'path';

const {problems} = require('../../../scripts/plugin-version.cjs');

test("Smart Pen's PluginConfig.json matches its package.json", () => {
  expect(problems(join(__dirname, '..'))).toEqual([]);
});
