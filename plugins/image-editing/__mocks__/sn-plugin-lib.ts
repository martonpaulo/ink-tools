export const PluginManager = {
  init: jest.fn(),
  registerConfigButton: jest.fn(),
  registerConfigButtonListener: jest.fn(),
  registerButton: jest.fn(async () => true),
  unregisterButton: jest.fn(async () => true),
  registerButtonListener: jest.fn(),
  hasPermission: jest.fn(async () => 2),
  requestPermission: jest.fn(async () => 2),
  showPluginView: jest.fn(),
};

export const PluginCommAPI = {
  getLassoElements: jest.fn(),
  getCurrentFilePath: jest.fn(),
  getCurrentPageNum: jest.fn(),
  generateLassoPreview: jest.fn(),
  modifyPageElements: jest.fn(),
};

export const PluginFileAPI = {
  getPageSize: jest.fn(),
};

/** A write on the open page saves the note first (#524): the save answers true by default. */
export const PluginNoteAPI = {
  saveCurrentNote: jest.fn(async () => ({success: true, result: true})),
};
