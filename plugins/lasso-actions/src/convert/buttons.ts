/**
 * Convert to Text's one lasso button (#250, moved from Smart Pen by #306): «Convert to Text», a
 * no-view lasso row, on while the module is (src/modules.ts). Its id follows Collection's.
 */
import {FILE_READ, FILE_WRITE, type PluginButton} from '../buttons';
import {copy} from '../copy';
import {PASTE_ID} from '../collection/buttons';

export const CONVERT_ID = PASTE_ID + 1;

export const CONVERT_BUTTONS: readonly PluginButton[] = [
  {
    id: CONVERT_ID,
    name: copy['button.convert'],
    icon: 'convert.png',
    // READ for the lasso and the page size, WRITE for the page change (code 1501 without it, #148).
    needs: [FILE_READ, {...FILE_WRITE, reason: copy['permission.convert']}],
  },
];
