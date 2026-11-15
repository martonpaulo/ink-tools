/** The device's shared storage root, owned by sn-adapter (#101). */
import { SHARED_ROOT } from "@supernote-tools/sn-adapter/official";
import { pluginProfile } from "./profile";

export { SHARED_ROOT };

/** `<root>/<the profile's folder>/<name>`, a folder or a file (brief section 6.6, #142). */
export function pluginPath(name: string, externalRoot = SHARED_ROOT): string {
  return `${externalRoot.replace(/\/+$/, "")}/${
    pluginProfile().folder
  }/${name}`;
}

/** The start of every temporary download's name in the private folder (#93). */
export const TEMPORARY_PREFIX = "insert-";

/**
 * `<plugin folder>/insert-<result id>.<extension>`: the raw download of an insert, in the private
 * folder, where writing it needs no permission; PluginHost counts replacing a file in shared
 * storage as a delete (#62). Named per result, so two inserts at the same time never write one
 * file (#93); removed after the insert.
 */
export function insertDownloadPath(
  pluginDir: string,
  id: string,
  extension: string
): string {
  return `${pluginDir}/${TEMPORARY_PREFIX}${safeFileName(id)}.${extension}`;
}

/**
 * `<plugin folder>/insert-early-<result id>.<extension>`: the full download «Insert best picture»
 * starts for the leading picture before page 1's order is known (#88); its own name, so a dropped
 * one never overwrites the winner's download (#93); removed once used or dropped.
 */
export function earlyDownloadPath(
  pluginDir: string,
  id: string,
  extension: string
): string {
  return `${pluginDir}/${TEMPORARY_PREFIX}early-${safeFileName(
    id
  )}.${extension}`;
}

/** True for a temporary download of `insertDownloadPath` or `earlyDownloadPath` in `pluginDir`. */
export function isTemporaryDownload(pluginDir: string, path: string): boolean {
  return (
    path.startsWith(`${pluginDir}/${TEMPORARY_PREFIX}`) &&
    !path.slice(pluginDir.length + 1).includes("/")
  );
}

/** A file name safe on the device: letters, digits, dot, dash and underscore only. */
export function safeFileName(name: string): string {
  return (
    name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file"
  );
}

/** `<root>/<folder>/logs`, where the session log lives (#21). */
export function logsDir(externalRoot = SHARED_ROOT): string {
  return pluginPath("logs", externalRoot);
}

/**
 * `<root>/<folder>/settings.json`, the person's settings (#68): in shared storage, so a
 * plugin update keeps them, written in place (#62).
 */
export function settingsPath(externalRoot = SHARED_ROOT): string {
  return pluginPath("settings.json", externalRoot);
}
