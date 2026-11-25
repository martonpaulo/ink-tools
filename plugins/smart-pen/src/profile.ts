/**
 * Smart Pen's PluginProfile and its settings store (#305): every Smart Pen file reads the settings
 * from here, so the profile is set before picture-search's storage tier runs. Its native modules are
 * registered as `SmartPenFiles` and `SmartPenImage` by `SmartPenFilesPackage` (native/), so no other
 * plugin installed beside it shares a module name (#142).
 */
import {
  createSettingsStore,
  type PluginProfile,
  setPluginProfile,
} from '@ink-tools/picture-search/storage';
import {version} from '../package.json';
import {versionCode} from '../PluginConfig.json';
import {PEN_SETTINGS} from './settings';

export const SMART_PEN_PROFILE: PluginProfile = {
  name: 'SmartPen',
  folder: 'MyStyle/SmartPen',
  filesModule: 'SmartPenFiles',
  imageModule: 'SmartPenImage',
  // Smart Pen downloads nothing; the profile still names one, as every profile does.
  userAgent: `SmartPen/${version}`,
  build: versionCode,
};

setPluginProfile(SMART_PEN_PROFILE);

export const {getSettings, saveSettings, resetSettingsForTests} =
  createSettingsStore(PEN_SETTINGS);
