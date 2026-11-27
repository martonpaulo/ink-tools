/**
 * Each lasso button's icon (#107): one 96 x 96 PNG per button, which the tablet scales to the lasso
 * list's 60 px (owner D43 A), rendered from the SVG beside it by `npm run icons`. Metro bundles only
 * a literal `require`, so each file is named once here; a button names its file
 * (`src/buttons.ts`), and `__tests__/icons.test.ts` checks that every button's file is listed.
 */
import {Image} from 'react-native';

export const ICONS: Readonly<Record<string, number>> = {
  'sticker.png': require('../assets/sticker.png'),
  'image.png': require('../assets/image.png'),
  'choose.png': require('../assets/choose.png'),
  'definition.png': require('../assets/definition.png'),
  'summary.png': require('../assets/summary.png'),
  'translate-es-pt.png': require('../assets/translate-es-pt.png'),
  'translate-pt-es.png': require('../assets/translate-pt-es.png'),
  'translate-zh-pt.png': require('../assets/translate-zh-pt.png'),
  'translate-pt-zh.png': require('../assets/translate-pt-zh.png'),
  'heading-1.png': require('../assets/heading-1.png'),
  'heading-2.png': require('../assets/heading-2.png'),
  'heading-3.png': require('../assets/heading-3.png'),
  'heading-4.png': require('../assets/heading-4.png'),
  'collection-add.png': require('../assets/collection-add.png'),
  'collection-cut.png': require('../assets/collection-cut.png'),
  'collection-paste.png': require('../assets/collection-paste.png'),
  'convert.png': require('../assets/convert.png'),
};

/** The URI the host loads for `file`, or undefined when no icon has that name. */
export function iconUri(file: string): string | undefined {
  const asset = ICONS[file];
  return asset === undefined ? undefined : Image.resolveAssetSource(asset)?.uri;
}
