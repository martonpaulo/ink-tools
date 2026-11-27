// The package has no @types/node; these declarations are all this test needs from it.
declare const __dirname: string;
declare function require(name: string): any;
const fs = require('node:fs');
const path = require('node:path');

import { WORD_LISTS } from '../src/words-data';
import { gridPattern, licenceProblems, WORD_LANGUAGES, type SourceManifest } from '../src/words';
import { generateWordSearch } from '../src/word-search';
import avoidData from '../words/avoid.json';

const ROOT = path.join(__dirname, '..');
const manifest: SourceManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'words', 'sources.json'), 'utf8'));
const notice: string = fs.readFileSync(path.join(ROOT, 'NOTICE.md'), 'utf8');

describe.each(WORD_LANGUAGES)('the %s list', language => {
  const list = WORD_LISTS[language];

  test('holds thousands of words in its grid letters, each once', () => {
    expect(list.language).toBe(language);
    expect(list.words.length).toBeGreaterThan(10000);
    const pattern = gridPattern(language);
    expect(list.words.filter(word => !pattern.test(word))).toEqual([]);
    expect(new Set(list.words).size).toBe(list.words.length);
    expect([...list.alphabet].every(letter => pattern.test(letter))).toBe(true);
  });

  test('scores every word, highest first', () => {
    expect(list.scores).toHaveLength(list.words.length);
    expect(list.scores[0]).toBe(100);
    expect(list.scores.every((s, i) => s >= 1 && (i === 0 || s <= list.scores[i - 1]))).toBe(true);
  });

  test('keeps word-search themes in each tier, every word in its grid letters', () => {
    expect(list.themes.length).toBeGreaterThanOrEqual(60);
    expect(new Set(list.themes.map(t => t.tier))).toEqual(new Set(['easy', 'medium', 'hard']));
    for (const theme of list.themes) {
      expect(theme.name).not.toBe('');
      expect(theme.words.filter(word => !gridPattern(language).test(word))).toEqual([]);
    }
  });

  test('a theme makes a word search in the language’s alphabet', () => {
    const theme = list.themes[0];
    const words = theme.words.filter(w => w.length <= 12).slice(0, 6);
    const puzzle = generateWordSearch('WORDS', 12, 'medium', words, { alphabet: list.alphabet });
    expect(puzzle.words.map(w => w.word).sort()).toEqual(words.slice().sort());
  });
});

describe('grid conventions', () => {
  test.each([
    ['pt', 'NAO'],
    ['pt', 'VOCE'],
    ['pt', 'CORACAO'],
    ['fr', 'ETE'],
    ['fr', 'COEUR'],
    ['de', 'MUESSEN'],
    ['de', 'STRASSE'],
    ['es', 'AÑO'],
    ['es', 'NIÑO'],
    ['en', 'HOUSE'],
  ] as const)('%s writes %s', (language, word) => {
    expect(WORD_LISTS[language].words).toContain(word);
  });

  test('Spanish themes keep Ñ where the word has it', () => {
    const words = WORD_LISTS.es.themes.flatMap(t => t.words);
    expect(words).toEqual(expect.arrayContaining(['MONTAÑA', 'ESPAÑA']));
    expect(words).not.toContain('ESPANA');
  });

  test('no list keeps a name or a contraction fragment', () => {
    expect(WORD_LISTS.en.words).not.toContain('TOM');
    expect(WORD_LISTS.en.words).not.toContain('DON');
    expect(WORD_LISTS.fr.words).not.toContain('QU');
    expect(WORD_LISTS.de.words).not.toContain('MARIA');
  });
});

describe('licence check', () => {
  test('every bundled list has recorded, allowed and noticed sources', () => {
    expect(licenceProblems(manifest, Object.values(WORD_LISTS), notice)).toEqual([]);
  });

  test('the avoid list of each language has recorded, allowed and noticed sources', () => {
    const avoid = WORD_LANGUAGES.map(language => ({ language, sources: [`ldnoobw-${language}`] }));
    expect(avoid.map(a => a.sources[0])).toEqual(avoidData.sources);
    expect(licenceProblems(manifest, avoid, notice)).toEqual([]);
  });

  test('every file in words/ but the sources and the avoid list is a list or a declared source', () => {
    const files: string[] = fs.readdirSync(path.join(ROOT, 'words'));
    const declared = new Set(Object.values(manifest.sources).map(s => s.path?.replace(/^words\//, '')));
    const lists = WORD_LANGUAGES.map(l => `${l}.json`);
    expect(files.filter(f => f !== 'sources.json' && f !== 'avoid.json' && !lists.includes(f) && !declared.has(f))).toEqual([]);
  });

  test.each([
    [{ language: 'en', sources: [] }, 'en: names no source'],
    [{ language: 'en', sources: ['nowhere'] }, 'source «nowhere» is not in words/sources.json'],
  ] as const)('a list fails: %j', (list, why) => {
    expect(licenceProblems(manifest, [list as never], notice).join('\n')).toContain(why);
  });

  test('a source with a refused licence, no licence or no notice fails', () => {
    const bad: SourceManifest = {
      allowedLicences: ['MIT'],
      sources: {
        copyleft: { name: 'Some Wiki Extract', licence: 'CC BY-SA 4.0', attribution: 'someone' },
        bare: { name: 'Bare list', licence: '', attribution: '' },
      },
    };
    const problems = licenceProblems(bad, [{ language: 'en', sources: ['copyleft', 'bare'] }], 'nothing named here').join('\n');
    expect(problems).toContain('licence «CC BY-SA 4.0» is not allowed');
    expect(problems).toContain('bare: no licence or attribution');
    expect(problems).toContain('NOTICE.md does not name «Some Wiki Extract»');
  });
});
