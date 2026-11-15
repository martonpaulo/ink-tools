import {PinyinIndex, readChineseInput, spellPinyin} from '../src/pinyin';
import {cedictPinyinIndex} from '../src/pinyin-data';

const small = new PinyinIndex({
  entries: ['ma 妈ma1 麻ma2 马ma3 骂ma4 吗ma5', 'pingguo 苹果ping2guo3 平锅ping2guo1', 'lv 绿lv4'],
});
const words = (input: string, index = small) => index.lookup(input).map(c => c.word);

test('characters go straight to translation, untouched', () => {
  expect(readChineseInput(' 苹果 ', small)).toEqual({
    kind: 'characters',
    candidates: [{word: '苹果'}],
  });
});

test('pinyin without tones gives every word it spells, best first', () => {
  expect(words('pingguo')).toEqual(['苹果', '平锅']);
  expect(words('Ping guo')).toEqual(['苹果', '平锅']);
  expect(words("ping'guo")).toEqual(['苹果', '平锅']);
});

test('tone marks and tone numbers narrow the words, and a partial tone is enough', () => {
  expect(words('píngguǒ')).toEqual(['苹果']);
  expect(words('ping2guo3')).toEqual(['苹果']);
  expect(words('pingguō')).toEqual(['平锅']);
  expect(words('mǎ')).toEqual(['马']);
  expect(words('ma0')).toEqual(['吗']);
  expect(words('píngguǒ')).toEqual(['苹果']);
  expect(words('píngguo')).toEqual(['苹果', '平锅']);
});

test('ü is read as ü, u: or v', () => {
  for (const spelling of ['lü', 'lǜ', 'lu:4', 'lv']) {
    expect(words(spelling)).toEqual(['绿']);
  }
});

test('a spelling with no word is empty, and input that is not pinyin is unreadable', () => {
  expect(readChineseInput('xyzzy', small)).toEqual({kind: 'pinyin', candidates: []});
  expect(words('pǐngguo')).toEqual([]);
  expect(readChineseInput('olá!', small).kind).toBe('unreadable');
  expect(readChineseInput('  ', small).kind).toBe('unreadable');
  expect(spellPinyin('3')).toBeNull();
});

test('the shipped CC-CEDICT index finds common words first', () => {
  const index = cedictPinyinIndex();
  expect(words('pingguo', index)[0]).toBe('苹果');
  expect(words('píngguǒ', index)).toContain('苹果');
  expect(words('zhongguo', index)).toContain('中国');
  expect(words('nǐhǎo', index)[0]).toBe('你好');
  expect(words('xiexie', index)[0]).toBe('谢谢');
  expect(index.lookup('mā')).toContainEqual({word: '妈', reading: 'ma1'});
  expect(index.lookup('mā').every(c => c.reading === 'ma1')).toBe(true);
  expect(cedictPinyinIndex()).toBe(index);
});
