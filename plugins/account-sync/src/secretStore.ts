/**
 * The sign-in secrets in Bridge's private plugin folder (#90, owner D16 A): one file per provider,
 * named by sync-core's `secretFileName`, that `inkctl secret set <provider>` writes over ADB
 * (#116). Bridge reads them through its `BridgeFiles` module, as it reads its Settings (#40), and
 * deletes one to sign out. A refused read throws with the module's reason: an unreadable secret is
 * never shown as signed out, and never sent to a service.
 */
import {REGISTRY} from '@ink-tools/sn-adapter/registry';
import {
  parseGoogleClient,
  parseSecret,
  secretFileName,
  SECRET_PROVIDERS,
  SecretProvider,
  SecretStore,
} from '@ink-tools/sync-core/secrets';
import {callFiles, TextFiles} from './files';
import {Folder} from './settingsStore';

const inFolder = (dir: string, provider: SecretProvider) =>
  `${dir.replace(/\/+$/, '')}/${secretFileName(provider)}`;

export function createSecretStore(
  folder: Folder,
  files?: TextFiles,
): SecretStore {
  const path = async (provider: SecretProvider) => {
    const dir = await folder();
    if (!dir.ok) {
      throw new Error(dir.message);
    }
    return inFolder(dir.value, provider);
  };
  return {
    async read(provider) {
      const file = await path(provider);
      const read = await callFiles(f => f.readText(file), files);
      if (!read.ok) {
        throw new Error(read.message);
      }
      return read.value === null ? null : parseSecret(read.value);
    },
    async remove(provider) {
      const file = await path(provider);
      const removed = await callFiles(f => {
        if (!f.deleteFile) {
          throw new Error('the file module cannot delete a file');
        }
        return f.deleteFile(file);
      }, files);
      if (!removed.ok) {
        throw new Error(removed.message);
      }
      // The module answers false when the file is still there after the delete.
      if (removed.value === false) {
        throw new Error(`the ${provider} sign-in was not deleted`);
      }
    },
  };
}

/**
 * The Google «Desktop app» OAuth client the token refresh needs (#200), from its own file beside
 * `google.secret`; null when it is not on the tablet. A broken file throws with the reason.
 */
export async function readGoogleClient(
  store: SecretStore,
): Promise<{clientId: string; clientSecret: string} | null> {
  const raw = await store.read('google-client');
  return raw === null ? null : parseGoogleClient(raw);
}

/**
 * Where `inkctl secret set` leaves a sign-in secret (#116): `adb shell` cannot write the private
 * folder (Permission denied on the tablet, 2026-11-17), so the Mac writes a one-shot drop file in a
 * folder the plugin file guard allows and Supernote Cloud does not sync (hidden), and Bridge moves
 * it in. It is registry item storage.sign-in-drop-folder, which inkctl reads too (#294).
 * shortcut: the folder is not yet measured on the tablet; the #116 device round checks it.
 */
export const SECRET_DROP_FOLDER = REGISTRY.storageSignInDropFolder.folder;

/** What happened to one provider's drop file; the value is never in it. */
export type SecretDrop =
  | {provider: SecretProvider; moved: true}
  | {provider: SecretProvider; moved: false; problem: string};

/**
 * Moves each waiting drop file into the private folder and deletes the drop file at once, even a
 * broken one, so no secret stays in shared storage. Only providers with a drop file are listed.
 */
export async function importSecretDrops(
  folder: Folder,
  files?: TextFiles,
  dropFolder: string = SECRET_DROP_FOLDER,
): Promise<SecretDrop[]> {
  const done: SecretDrop[] = [];
  for (const provider of SECRET_PROVIDERS) {
    const drop = inFolder(dropFolder, provider);
    const read = await callFiles(f => f.readText(drop), files);
    if (read.ok && read.value === null) {
      continue;
    }
    let problem: string | undefined;
    if (!read.ok) {
      problem = `the drop file did not read: ${read.message}`;
    } else {
      let value: string | undefined;
      try {
        value = parseSecret(read.value!);
      } catch (e) {
        problem = (e as Error).message;
      }
      if (value !== undefined) {
        const dir = await folder();
        if (!dir.ok) {
          problem = dir.message;
        } else {
          const target = inFolder(dir.value, provider);
          const written = await callFiles(
            f => f.writeText(target, value!),
            files,
          );
          if (!written.ok) {
            problem = `the secret was not saved: ${written.message}`;
          }
        }
      }
    }
    if (read.ok) {
      const removed = await callFiles(f => {
        if (!f.deleteFile) {
          throw new Error('the file module cannot delete a file');
        }
        return f.deleteFile(drop);
      }, files);
      if (!removed.ok || removed.value === false) {
        const why = removed.ok ? 'it is still there' : removed.message;
        problem = `${
          problem ? `${problem}; ` : ''
        }the drop file was not deleted: ${why}`;
      }
    }
    done.push(
      problem ? {provider, moved: false, problem} : {provider, moved: true},
    );
  }
  return done;
}
