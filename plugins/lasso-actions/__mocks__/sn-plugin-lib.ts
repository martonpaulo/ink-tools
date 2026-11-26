export const PluginManager = {
  init: jest.fn(),
  registerConfigButton: jest.fn(),
  registerConfigButtonListener: jest.fn(),
  registerButton: jest.fn(async () => true),
  unregisterButton: jest.fn(async () => true),
  registerButtonListener: jest.fn(),
  hasPermission: jest.fn(async () => 2),
  requestPermission: jest.fn(),
  showPluginView: jest.fn(),
};

export const PluginCommAPI = {
  getLassoElements: jest.fn(),
  getLassoRect: jest.fn(),
  recognizeElements: jest.fn(),
};

export const PluginFileAPI = {
  getPageSize: jest.fn(),
  getElements: jest.fn(),
};

export const PluginNoteAPI = {
  insertText: jest.fn(),
};
