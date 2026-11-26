export const PluginManager = {
  init: jest.fn(),
  registerConfigButton: jest.fn(),
  registerConfigButtonListener: jest.fn(),
  registerButton: jest.fn(),
  showPluginView: jest.fn(),
  getPluginDirPath: jest.fn(async () => '/plugin'),
};

export const PluginFileAPI = {
  generateNotePng: jest.fn(),
};

export const PluginCommAPI = {
  generateLassoPreview: jest.fn(),
};
