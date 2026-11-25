/**
 * The PluginProfile the package's own tests run with (#142): a plugin sets its own at start, so a
 * test sets this one before calling the file store, the image module or the logs.
 */
import {setPluginProfile, type PluginProfile} from '../src/storage';

export const TEST_PROFILE: PluginProfile = {
  name: 'Test',
  folder: 'MyStyle/Test',
  filesModule: 'TestFiles',
  imageModule: 'TestImage',
  userAgent: 'InkToolsTest/1.0',
  build: '1',
};

setPluginProfile(TEST_PROFILE);
