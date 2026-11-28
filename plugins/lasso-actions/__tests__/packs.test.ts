import {PACK_CONFIG, RemotePack, packFail} from '@ink-tools/pack-store';
import {packFailureProblem, packNeedsProblem, packQuestionText, sizeText} from '../src/packs';

const PACK: RemotePack = {
  language: 'en',
  version: '2',
  size: 4 * 1024 * 1024,
  sha256: 'a'.repeat(64),
  licence: 'CC BY-SA 4.0',
  url: 'https://example.test/en-2.pack',
};

describe('the language pack download in Lasso Actions', () => {
  it('shows the size before the download', () => {
    expect(packQuestionText({pack: PACK, bytes: PACK.size, replaces: null, metered: false}, 'English')).toBe(
      'Language English: words and dictionary, 4 MB. Download?',
    );
  });

  it('shows a new version with its own size again', () => {
    expect(packQuestionText({pack: PACK, bytes: 12_800_000, replaces: '1', metered: false}, 'English')).toBe(
      'A new version of the English language pack: 12 MB, replacing version 1. Download?',
    );
  });

  it('warns on a metered network', () => {
    expect(packQuestionText({pack: PACK, bytes: PACK.size, replaces: null, metered: true}, 'English')).toMatch(
      /^You are on a metered network, such as a phone hotspot, .* Download\?$/,
    );
  });

  it('rounds small sizes to one decimal and never shows zero', () => {
    expect(sizeText(1_572_864)).toBe('1.5 MB');
    expect(sizeText(65)).toBe('0.1 MB');
  });

  it('names each missing requirement and the one step that fixes it', () => {
    const problem = packNeedsProblem(['network', 'free-space'], PACK.size);
    expect(problem.what).toBe('The language pack cannot be downloaded now.');
    expect(problem.reason).toBe('The tablet has no network. The tablet has not enough free space for this pack.');
    expect(problem.fix).toEqual({
      steps: [
        'Turn on Wi-Fi in the tablet Settings, then try again.',
        `Free at least ${sizeText(PACK.size + PACK_CONFIG.freeSpaceMarginBytes)} on the tablet, then try again.`,
      ],
    });
  });

  it('says plainly why a download failed', () => {
    expect(packFailureProblem(packFail('HASH_MISMATCH', 'raw detail'))).toEqual({
      what: 'The language pack was not installed.',
      reason: 'The downloaded pack did not match its check, so it was deleted. Try again.',
    });
  });
});
