/** The glue to sn-plugin-lib: a written stroke carries a pen type the host accepts (#249), a render saves first (#296). */
import {FileUtils, PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {noteApi, saveFirst} from '../src/noteApi';

jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {
    createElement: jest.fn(),
    insertPageElements: jest.fn(),
    getCurrentFilePath: jest.fn(),
    lassoElements: jest.fn(),
    getLassoElementTypeCounts: jest.fn(),
  },
  PluginFileAPI: {generateNotePng: jest.fn(), getElements: jest.fn(), insertNotePage: jest.fn()},
  PluginNoteAPI: {saveCurrentNote: jest.fn()},
  PluginManager: {getPluginDirPath: jest.fn(async () => '/data/plugins/probe/')},
  FileUtils: {copyFile: jest.fn(async () => true)},
}));

const accessor = () => ({add: jest.fn().mockResolvedValue(true)});

test('a written stroke is a fineliner, never the penType 0 the host refuses (code 302)', async () => {
  const element = {type: 0, stroke: {points: accessor(), pressures: accessor(), flagDraw: accessor(), penType: 0}};
  (PluginCommAPI.createElement as jest.Mock).mockResolvedValue({success: true, result: element});
  (PluginCommAPI.insertPageElements as jest.Mock).mockResolvedValue({success: true, result: true});
  await noteApi.insertStrokes([[{x: 1, y: 2}, {x: 3, y: 4}]], 0);
  expect(element.stroke.penType).toBe(10);
  expect(PluginCommAPI.insertPageElements).toHaveBeenCalledWith([element], 0, null);
});

describe('renderPage saves the note first (#296)', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    (PluginCommAPI.getCurrentFilePath as jest.Mock).mockResolvedValue({success: true, result: '/Note/a.note'});
    (PluginFileAPI.generateNotePng as jest.Mock).mockImplementation(async () => {
      calls.push('png');
      return {success: true, result: true};
    });
  });

  test('saves before the PNG is made', async () => {
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockImplementation(async () => {
      calls.push('save');
      return {success: true, result: true};
    });
    await noteApi.renderPage(0, '/storage/emulated/0/.data/plugin/inktools-probe/page.png');
    expect(calls).toEqual(['save', 'png']);
  });

  test('draws the page after a failed or thrown save, and logs it', async () => {
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: false, error: {code: 904, message: 'busy'}});
    await noteApi.renderPage(0, '/storage/emulated/0/.data/plugin/inktools-probe/page.png');
    expect(calls).toEqual(['png']);
    const lines: string[] = [];
    const clock = [0, 12];
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockRejectedValue(new Error('no note'));
    await saveFirst(line => lines.push(line), () => clock.shift() ?? 0);
    expect(lines).toEqual(['save: failed: no note in 12 ms: the page is drawn as the file holds it']);
  });
});

describe('renderPage draws in the private folder, then copies to the channel (#296)', () => {
  beforeEach(() => {
    (PluginCommAPI.getCurrentFilePath as jest.Mock).mockResolvedValue({success: true, result: '/Note/a.note'});
    (PluginFileAPI.generateNotePng as jest.Mock).mockResolvedValue({success: true, result: true});
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: true, result: true});
  });

  test('never asks generateNotePng for the hidden folder it refuses with 1204', async () => {
    const channel = '/storage/emulated/0/.data/plugin/inktools-probe/page.png';
    await noteApi.renderPage(0, channel);
    expect((PluginFileAPI.generateNotePng as jest.Mock).mock.calls.at(-1)[0]).toMatchObject({pngPath: '/data/plugins/probe/page.png'});
    expect(FileUtils.copyFile).toHaveBeenLastCalledWith('/data/plugins/probe/page.png', channel);
  });

  test('fails when the copy does not reach the channel', async () => {
    (FileUtils.copyFile as jest.Mock).mockResolvedValueOnce(false);
    await expect(noteApi.renderPage(0, '/c/page.png')).rejects.toThrow('copyFile: the page image did not reach /c/page.png');
  });
});

describe('the page PNG leaves pictures out, so the render counts them (#263)', () => {
  beforeEach(() => {
    (PluginCommAPI.getCurrentFilePath as jest.Mock).mockResolvedValue({success: true, result: '/Note/a.note'});
    (PluginFileAPI.generateNotePng as jest.Mock).mockResolvedValue({success: true, result: true});
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: true, result: true});
  });

  test('answers the picture elements of the rendered page', async () => {
    (PluginFileAPI.getElements as jest.Mock).mockResolvedValue({success: true, result: [{type: 200}, {type: 0}, {type: 200}]});
    expect(await noteApi.renderPage(1, '/p.png')).toEqual({pictures: 2});
    expect(PluginFileAPI.getElements).toHaveBeenCalledWith(1, '/Note/a.note');
  });

  test('answers null, never 0, when the elements did not read', async () => {
    (PluginFileAPI.getElements as jest.Mock).mockResolvedValue({success: false, error: {code: 1, message: 'x'}});
    expect(await noteApi.renderPage(1, '/p.png')).toEqual({pictures: null});
  });
});

describe('insertPage saves the open note first, or inserts nothing (#263)', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    (PluginCommAPI.getCurrentFilePath as jest.Mock).mockResolvedValue({success: true, result: '/Note/a.note'});
    (PluginFileAPI.insertNotePage as jest.Mock).mockImplementation(async () => {
      calls.push('insert');
      return {success: true, result: true};
    });
  });

  test('saves before the insert, which would drop the unsaved ink', async () => {
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockImplementation(async () => {
      calls.push('save');
      return {success: true, result: true};
    });
    await noteApi.insertPage(1, 'style_white');
    expect(calls).toEqual(['save', 'insert']);
  });

  test('a failed save inserts no page', async () => {
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: false, error: {code: 904, message: 'busy'}});
    await expect(noteApi.insertPage(1, 'style_white')).rejects.toThrow(/no page was inserted/);
    expect(calls).toEqual([]);
  });
});

describe('lasso (#325)', () => {
  const rect = {left: 10, top: 10, right: 50, bottom: 50};

  test('a rect that lassoes nothing is a refusal, never the previous lasso\'s counts', async () => {
    (PluginCommAPI.lassoElements as jest.Mock).mockResolvedValue({success: true, result: false});
    (PluginCommAPI.getLassoElementTypeCounts as jest.Mock).mockResolvedValue({success: true, result: {trailNum: 8}});
    await expect(noteApi.lasso(rect)).rejects.toThrow(/lassoed nothing/);
    expect(PluginCommAPI.getLassoElementTypeCounts).not.toHaveBeenCalled();
  });

  test('a rect that lassoes answers the counts', async () => {
    (PluginCommAPI.lassoElements as jest.Mock).mockResolvedValue({success: true, result: true});
    (PluginCommAPI.getLassoElementTypeCounts as jest.Mock).mockResolvedValue({success: true, result: {trailNum: 1}});
    expect(await noteApi.lasso(rect)).toEqual({trailNum: 1});
  });
});
