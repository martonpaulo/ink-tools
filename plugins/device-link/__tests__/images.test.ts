/** The page and lasso images through sn-adapter's official tier (#98). */
import {PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {
  EMPTY_LASSO_CODE,
  lassoImage,
  pageImage,
  WHITE_PNG,
} from '@ink-tools/sn-adapter/official';

const generateNotePng = PluginFileAPI.generateNotePng as jest.Mock;
const generateLassoPreview = PluginCommAPI.generateLassoPreview as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('pageImage', () => {
  test('renders the page at its own size, on white, and answers the path', async () => {
    generateNotePng.mockResolvedValue({success: true, result: true});
    await expect(pageImage('/n.note', 2, '/tmp/p.png')).resolves.toEqual({
      ok: true,
      value: '/tmp/p.png',
    });
    expect(generateNotePng).toHaveBeenCalledWith({
      notePath: '/n.note',
      page: 2,
      times: 1,
      pngPath: '/tmp/p.png',
      type: WHITE_PNG,
    });
  });

  test('a false or null answer is a failure, never a path', async () => {
    generateNotePng.mockResolvedValueOnce({success: true, result: false});
    expect((await pageImage('/n.note', 0, '/p.png')).ok).toBe(false);
    generateNotePng.mockResolvedValueOnce(null);
    expect((await pageImage('/n.note', 0, '/p.png')).ok).toBe(false);
  });
});

describe('lassoImage', () => {
  test('a LassoPreview gives its imagePath', async () => {
    generateLassoPreview.mockResolvedValue({
      success: true,
      result: {
        imagePath: '/tmp/l.png',
        rect: {left: 0, top: 0, right: 9, bottom: 9},
        rotateDegree: 0,
      },
    });
    await expect(lassoImage('/tmp/l.png')).resolves.toEqual({
      ok: true,
      value: '/tmp/l.png',
    });
  });

  test('a null preview is «nothing selected»', async () => {
    generateLassoPreview.mockResolvedValue({success: true, result: null});
    const answer = await lassoImage('/tmp/l.png');
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.code).toBe(EMPTY_LASSO_CODE);
  });

  test('a host error stays a failure with its code', async () => {
    generateLassoPreview.mockResolvedValue({
      success: false,
      error: {code: 7, message: 'no lasso'},
    });
    await expect(lassoImage('/tmp/l.png')).resolves.toEqual({
      ok: false,
      code: 7,
      message: 'no lasso',
    });
  });
});
