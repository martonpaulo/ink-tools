/**
 * The action `templates` (#451): the tablet's page templates, each by the value `insertNotePage`
 * takes, for Ink Notebook Editor's Insert Page. It reads and writes nothing else: the system
 * templates by their names (`getNoteSystemTemplates`, such as `style_white`), and the custom ones,
 * the PNGs straight in `MyStyle/`, by their full paths (docs/supernote.md › Note file format).
 */
import {SHARED_ROOT, type ActionResult, type FolderEntry, type Result} from '@ink-tools/sn-adapter/official';

/** The folder whose PNGs the tablet takes as custom templates, by their full path. */
export const CUSTOM_TEMPLATE_FOLDER = `${SHARED_ROOT}/MyStyle`;
/** A custom template's file: a PNG straight in CUSTOM_TEMPLATE_FOLDER, as inkctl's BACKGROUND_NAME. */
export const CUSTOM_TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]*\.png$/i;

export type TemplateHost = {
  systemTemplates(): Promise<Result<string[]>>;
  listFolder(path: string): Promise<Result<FolderEntry[]>>;
};

/** Whether `value` is the full path of a custom template: a PNG straight in MyStyle/. */
export function isCustomTemplatePath(value: unknown): value is string {
  const prefix = `${CUSTOM_TEMPLATE_FOLDER}/`;
  return typeof value === 'string' && value.startsWith(prefix) && CUSTOM_TEMPLATE_NAME.test(value.slice(prefix.length));
}

export function templatesAction(host: TemplateHost) {
  return async (): Promise<ActionResult> => {
    const system = await host.systemTemplates();
    if (!system.ok) {
      throw new Error(`getNoteSystemTemplates failed: ${system.code} ${system.message}`);
    }
    const folder = await host.listFolder(CUSTOM_TEMPLATE_FOLDER);
    if (!folder.ok) {
      throw new Error(`listFiles of ${CUSTOM_TEMPLATE_FOLDER} failed: ${folder.code} ${folder.message}`);
    }
    const custom = folder.value
      .filter(entry => !entry.folder && isCustomTemplatePath(entry.path))
      .map(entry => ({name: entry.path.slice(CUSTOM_TEMPLATE_FOLDER.length + 1).replace(/\.png$/i, ''), path: entry.path}))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      line: `DeviceLink: templates: ${system.value.length} system, ${custom.length} custom`,
      system: system.value.map(name => ({name})),
      custom,
    };
  };
}
