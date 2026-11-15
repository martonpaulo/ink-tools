/**
 * The ZH button's input (#129): Chinese characters go straight to translation; pinyin, with tone
 * marks, tone numbers or no tones (`píngguǒ`, `ping2guo3`, `pingguo`), is first looked up to the
 * words it spells. The lookup is offline (owner D47 B), in the index
 * `scripts/build-pinyin-index.cjs` builds from CC-CEDICT (see its header and ../NOTICE.md).
 */

/** One line per toneless spelling: `pingguo 苹果ping2guo3 平锅ping2guo1`, best first. */
export interface PinyinIndexData {
  entries: readonly string[];
}

export interface ChineseCandidate {
  /** Simplified characters. */
  word: string;
  /** The numbered reading, `ping2guo3`, with `v` for ü; absent for input given as characters. */
  reading?: string;
}

export type ChineseInput =
  | {kind: 'characters'; candidates: ChineseCandidate[]}
  | {kind: 'pinyin'; candidates: ChineseCandidate[]}
  /** Neither characters nor letters that spell pinyin: nothing to look up. */
  | {kind: 'unreadable'; candidates: []};

const HAN = /[\u3007\u3400-\u4dbf\u4e00-\u9fff\u{20000}-\u{3134f}]/u;
/** A vowel with a tone mark, as its letter and its tone. */
const MARKED: Record<string, [string, number]> = {};
for (const [letter, marked] of [
  ['a', 'āáǎà'],
  ['e', 'ēéěè'],
  ['i', 'īíǐì'],
  ['o', 'ōóǒò'],
  ['u', 'ūúǔù'],
  ['v', 'ǖǘǚǜ'],
] as const) {
  [...marked].forEach((char, i) => (MARKED[char] = [letter, i + 1]));
}
const COMBINING_TONES: Record<string, number> = {
  '\u0304': 1,
  '\u0301': 2,
  '\u030c': 3,
  '\u0300': 4,
};

/** Input pinyin as its toneless letters and the tones the writer gave, at a letter's place. */
interface Spelled {
  letters: string;
  tones: Array<{at: number; tone: number}>;
}

/**
 * Reads pinyin: lower case, `ü`, `u:` and `v` alike, spaces, apostrophes and hyphens dropped. A
 * tone mark sets the tone of its letter's syllable; a tone digit, of the syllable it ends (0 is
 * the neutral 5). Null when anything else is left.
 */
export const spellPinyin = (input: string): Spelled | null => {
  const text = input.normalize('NFC').toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
  let letters = '';
  const tones: Spelled['tones'] = [];
  for (const char of text.normalize('NFC')) {
    if (/[a-z]/.test(char)) {
      letters += char;
    } else if (MARKED[char]) {
      const [letter, tone] = MARKED[char];
      tones.push({at: letters.length, tone});
      letters += letter;
    } else if (COMBINING_TONES[char] && letters) {
      tones.push({at: letters.length - 1, tone: COMBINING_TONES[char]});
    } else if (/[0-5]/.test(char) && letters) {
      tones.push({at: letters.length - 1, tone: char === '0' ? 5 : Number(char)});
    } else if (!/[\s'’-]/.test(char)) {
      return null;
    }
  }
  return letters ? {letters, tones} : null;
};

/** Each letter's tone in a numbered reading: `ping2guo3` gives 2,2,2,2,3,3,3. */
const lettersTones = (reading: string): number[] => {
  const out: number[] = [];
  let syllable = 0;
  for (const char of reading) {
    if (/\d/.test(char)) {
      out.fill(Number(char), syllable);
      syllable = out.length;
    } else {
      out.push(0);
    }
  }
  return out;
};

/** True when every tone the writer gave is the tone of that letter's syllable. */
const tonesMatch = (reading: string, tones: Spelled['tones']): boolean => {
  if (!tones.length) {
    return true;
  }
  const byLetter = lettersTones(reading);
  return tones.every(({at, tone}) => byLetter[at] === tone);
};

const CANDIDATE = /^(\P{Script=Latin}+)([a-z1-5]+)$/u;

export class PinyinIndex {
  private readonly lines = new Map<string, string>();

  constructor(data: PinyinIndexData) {
    for (const line of data.entries) {
      const space = line.indexOf(' ');
      this.lines.set(line.slice(0, space), line.slice(space + 1));
    }
  }

  /**
   * The words `input` spells, best first: every word with its letters when no tone is given, else
   * only those whose syllables carry the tones given. An unknown spelling is an empty list.
   */
  lookup(input: string): ChineseCandidate[] {
    const spelled = spellPinyin(input);
    const line = spelled && this.lines.get(spelled.letters);
    if (!spelled || !line) {
      return [];
    }
    const out: ChineseCandidate[] = [];
    for (const item of line.split(' ')) {
      const match = CANDIDATE.exec(item);
      if (match && tonesMatch(match[2], spelled.tones)) {
        out.push({word: match[1], reading: match[2]});
      }
    }
    return out;
  }
}

/**
 * The ZH button's input as the words to translate: characters as they are, pinyin through the
 * index. shortcut: candidates are ranked by CC-CEDICT's own data, not by word frequency, so a
 * bare one-syllable spelling can lead with a rare character; add a frequency list when the
 * device round shows a wrong first pick.
 */
export const readChineseInput = (input: string, index: PinyinIndex): ChineseInput => {
  const text = input.trim();
  if (HAN.test(text)) {
    return {kind: 'characters', candidates: [{word: text}]};
  }
  if (!spellPinyin(text)) {
    return {kind: 'unreadable', candidates: []};
  }
  return {kind: 'pinyin', candidates: index.lookup(text)};
};
