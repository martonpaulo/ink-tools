/**
 * Each plugin package that subclasses `Ink2PicFilesPackage` names its own folders for
 * `SafePaths.Roots.plugin` (#302): its `PLUGIN_ID` must be its PluginConfig.json `pluginID`, the
 * name of its private folder, or every private path it passes is refused on the tablet.
 */
import fs from 'node:fs';
import path from 'node:path';

const PLUGINS = path.join(__dirname, '..', '..', '..', 'plugins');

function javaFiles(folder: string): string[] {
  if (!fs.existsSync(folder)) {
    return [];
  }
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? javaFiles(full) : entry.name.endsWith('.java') ? [full] : [];
  });
}

const packages = fs
  .readdirSync(PLUGINS)
  .flatMap(plugin =>
    javaFiles(path.join(PLUGINS, plugin, 'native')).map(file => ({plugin, file})),
  )
  .map(({plugin, file}) => ({plugin, file, source: fs.readFileSync(file, 'utf8')}))
  .filter(({source}) => /extends Ink2PicFilesPackage\b/.test(source));

describe("each plugin's file roots", () => {
  it('finds the four plugins that use the shared file module', () => {
    expect(packages.map(p => p.plugin).sort()).toEqual([
      'account-sync',
      'image-editing',
      'lasso-actions',
      'smart-pen',
    ]);
  });

  it.each(packages.map(p => [p.plugin, p] as const))(
    "%s's PLUGIN_ID is its pluginID",
    (plugin, {source}) => {
      const config = JSON.parse(
        fs.readFileSync(path.join(PLUGINS, plugin, 'PluginConfig.json'), 'utf8'),
      ) as {pluginID: string};
      const id = /static final String PLUGIN_ID = "([^"]+)";/.exec(source)?.[1];
      expect(id).toBe(config.pluginID);
      expect(source).toContain('SafePaths.Roots.plugin(');
      expect(source).toContain('PLUGIN_ID');
    },
  );

  it("reads Account Sync's sign-in drop folder from the registry", () => {
    const bridge = packages.find(p => p.plugin === 'account-sync');
    expect(bridge?.source).toContain('Registry.StorageSignInDropFolder.FOLDER');
  });
});
