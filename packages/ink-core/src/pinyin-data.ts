/**
 * The CC-CEDICT pinyin index (#129), kept out of `index.ts` so a plugin without a ZH button never
 * bundles its 3.4 MB: only the plugin that reads pinyin imports this file.
 */
import DATA from './data/pinyin-index.json';
import {PinyinIndex} from './pinyin';

let index: PinyinIndex | undefined;

/** The index, built on the first call and kept. */
export const cedictPinyinIndex = (): PinyinIndex => (index ??= new PinyinIndex(DATA));
