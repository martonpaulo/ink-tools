/**
 * The tablet behind the editor helper's EditHost (#312): each method one sn-adapter call, no rule
 * of its own. The request file is read with Device Link's own `RelayLocalSend.readText`.
 */
import {
  buildElement,
  deleteElements,
  deletePageElements,
  getCurrentFilePath,
  getElement,
  getNoteTotalPageNum,
  insertElements,
  insertNotePage,
  insertPageElements,
  listFolder,
  modifyElements,
  modifyPageElements,
  noteSystemTemplates,
  placeElement,
  removeNotePage,
  saveCurrentNote,
  transformElement,
  ACTION_FILE,
} from '@ink-tools/sn-adapter/official';
import type {Relay} from '../native';
import {EDITOR_FOLDER, PAGE, type EditHost} from './operations';
import type {PenGate} from './penGate';
import type {TemplateHost} from './templates';

/** Where inkctl writes the request: `ACTION_PLUGINS['device-link']` in cli/inkctl/src/inkctl. */
export const EDITOR_ACTION_PATH = `${EDITOR_FOLDER}${ACTION_FILE}`;

/** The request file's text, null when there is none; a failed read throws, and the channel reads again later. */
export async function readEditorRequest(native: Relay): Promise<string | null> {
  const text = await native.readText(EDITOR_ACTION_PATH);
  if (!text.ok) {
    throw new Error(text.message);
  }
  return text.value;
}

export function deviceEditHost(pen: PenGate): EditHost & TemplateHost {
  return {
    openNote: getCurrentFilePath,
    saveOpenNote: saveCurrentNote,
    pageCount: getNoteTotalPageNum,
    build: buildElement,
    getElement,
    place: placeElement,
    transform: (element, page, matrix) => transformElement(element, page, matrix, PAGE),
    insertOpen: (page, elements) => insertPageElements(elements, page),
    insertByPath: insertElements,
    modifyOpen: (page, elements) => modifyPageElements(elements, page),
    modifyByPath: modifyElements,
    deleteOpen: (page, nums) => deletePageElements(nums, page),
    deleteByPath: deleteElements,
    insertPage: insertNotePage,
    removePage: removeNotePage,
    penIdle: () => pen.idle(),
    systemTemplates: noteSystemTemplates,
    listFolder,
  };
}
