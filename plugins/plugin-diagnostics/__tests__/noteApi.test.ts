/** The glue to sn-plugin-lib: a written stroke carries a pen type the host accepts (#249), a render saves first (#296). */
import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {noteApi, saveFirst} from '../src/noteApi';

jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {createElement: jest.fn(), insertPageElements: jest.fn(), getCurrentFilePath: jest.fn()},
  PluginFileAPI: {generateNotePng: jest.fn()},
  PluginNoteAPI: {saveCurrentNote: jest.fn()},
  PluginManager: {},
  FileUtils: {},
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
    await noteApi.renderPage(0, '/storage/emulated/0/MyStyle/Probe/page.png');
    expect(calls).toEqual(['save', 'png']);
  });

  test('draws the page after a failed or thrown save, and logs it', async () => {
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockResolvedValue({success: false, error: {code: 904, message: 'busy'}});
    await noteApi.renderPage(0, '/storage/emulated/0/MyStyle/Probe/page.png');
    expect(calls).toEqual(['png']);
    const lines: string[] = [];
    const clock = [0, 12];
    (PluginNoteAPI.saveCurrentNote as jest.Mock).mockRejectedValue(new Error('no note'));
    await saveFirst(line => lines.push(line), () => clock.shift() ?? 0);
    expect(lines).toEqual(['save: failed: no note in 12 ms: the page is drawn as the file holds it']);
  });
});
