/**
 * The sign-in secrets in Bridge's private plugin folder (#90, owner D16 A): one file per provider,
 * named by sync-core's `secretFileName`, that `inkctl secret set <provider>` writes over ADB
 * (#116). Bridge reads them through its `BridgeFiles` module, as it reads its Settings (#40), and
 * deletes one to sign out. A refused read throws with the module's reason: an unreadable secret is
 * never shown as signed out, and never sent to a service.
 */
import {
  parseSecret,
  secretFileName,
  SecretProvider,
  SecretStore,
} from '@supernote-tools/sync-core/secrets';
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
