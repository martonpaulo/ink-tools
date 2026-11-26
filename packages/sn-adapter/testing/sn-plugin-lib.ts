/** Jest mock of the SDK surface sn-adapter wraps in src/official/; every call is a jest.fn(). */
const mocks = (...names: string[]): Record<string, jest.Mock> =>
  Object.fromEntries(names.map(name => [name, jest.fn()]));

export const PluginManager = {
  ...mocks(
    'init',
    'registerButton',
    'unregisterButton',
    'getDeviceType',
    'requestPermission',
    'hasPermission',
    'getPluginDirPath',
    'closePluginView',
    'showPluginView',
    'registerConfigButton',
  ),
  registerButtonListener: jest.fn(() => ({remove: jest.fn()})),
  registerConfigButtonListener: jest.fn(() => ({remove: jest.fn()})),
  registerLangListener: jest.fn(() => ({remove: jest.fn()})),
  registerPluginLifeListener: jest.fn(() => ({remove: jest.fn()})),
  registerEventListener: jest.fn(() => ({remove: jest.fn()})),
  registerMotionListener: jest.fn(() => ({remove: jest.fn()})),
};

export const PluginCommAPI = mocks(
  'getLassoElements',
  'getLassoRect',
  'lassoElements',
  'recognizeElements',
  'setLassoBoxState',
  'deleteLassoElements',
  'getCurrentFilePath',
  'getCurrentPageNum',
  'getPageDisplaySize',
  'createElement',
  'insertPageElements',
  'getPenInfo',
  'convertElement2Sticker',
  'insertSticker',
  'insertGeometry',
  'deletePageElements',
  'resizeLassoRect',
  'reloadFile',
  'batchUpdatePageElements',
  'saveStickerByLasso',
);

export const PluginNoteAPI = mocks(
  'insertText',
  'insertImage',
  'saveCurrentNote',
  'setLassoTitle',
);

export const PluginFileAPI = mocks(
  'getPageSize',
  'insertElements',
  'getLastElement',
  'getElements',
  'getElement',
  'modifyElements',
  'deleteElements',
  'removeNotePage',
  'getNoteTotalPageNum',
);

export const NativeUIUtils = mocks('showRattaDialog', 'showErrorTipDialog');

export const FileUtils = mocks(
  'exists',
  'makeDir',
  'listFiles',
  'getExternalDirPath',
);
