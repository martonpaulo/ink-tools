/** The glue to sn-plugin-lib: a written stroke carries a pen type the host accepts (#249). */
import {PluginCommAPI} from 'sn-plugin-lib';
import {noteApi} from '../src/noteApi';

jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {createElement: jest.fn(), insertPageElements: jest.fn()},
  PluginFileAPI: {},
  PluginNoteAPI: {},
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
