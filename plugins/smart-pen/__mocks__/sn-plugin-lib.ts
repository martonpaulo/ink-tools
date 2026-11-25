export const PluginManager = {
  init: jest.fn(),
  registerConfigButton: jest.fn(),
  registerConfigButtonListener: jest.fn(),
  registerButton: jest.fn(async () => true),
  unregisterButton: jest.fn(async () => true),
  registerButtonListener: jest.fn(),
  registerEventListener: jest.fn(() => ({remove: jest.fn()})),
  hasPermission: jest.fn(async () => 2),
  requestPermission: jest.fn(),
  showPluginView: jest.fn(),
};

export const PluginCommAPI = {
  createElement: jest.fn(),
  recognizeElements: jest.fn(),
  getCurrentFilePath: jest.fn(),
  getCurrentPageNum: jest.fn(),
  batchUpdatePageElements: jest.fn(),
};

export const PluginFileAPI = {
  getPageSize: jest.fn(),
  getElements: jest.fn(),
};

export const PluginNoteAPI = {
  insertText: jest.fn(),
};
