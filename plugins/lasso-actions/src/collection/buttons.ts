/**
 * Collection's buttons (#249, owner #304): «Add to Collection» and «Cut to Collection» are lasso
 * rows with no view; «Paste Collection» is a NOTE toolbar «Plugins» button that opens the
 * collection's view (its count, Paste, Clear and «Keep After Paste»). Each is on while the module
 * is (src/modules.ts); their ids follow Headings'.
 */
import {FILE_READ, FILE_WRITE, type PluginButton} from '../buttons';
import {copy} from '../copy';
import {FIRST_HEADING_ID} from '../headings/buttons';
import {HEADING_LEVELS} from '../headings/levels';

export const ADD_ID = FIRST_HEADING_ID + HEADING_LEVELS.length;
export const CUT_ID = ADD_ID + 1;
export const PASTE_ID = ADD_ID + 2;

const NEEDS = [
  FILE_READ,
  {...FILE_WRITE, reason: copy['permission.collection']},
] as const;

export const COLLECTION_BUTTONS: readonly PluginButton[] = [
  {
    id: ADD_ID,
    name: copy['button.collectionAdd'],
    icon: 'collection-add.png',
    needs: NEEDS,
  },
  {
    id: CUT_ID,
    name: copy['button.collectionCut'],
    icon: 'collection-cut.png',
    needs: NEEDS,
  },
  {
    id: PASTE_ID,
    name: copy['button.collectionPaste'],
    icon: 'collection-paste.png',
    needs: NEEDS,
    kind: 'sidebar',
    showView: true,
  },
];
