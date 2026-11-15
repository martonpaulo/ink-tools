/**
 * The device's shared storage root, as the host's own paths show it (`getCurrentFilePath` answered
 * `/storage/emulated/0/Note/...` on the Manta, Ink2Pic builds 0.1.0 (3) to (8)). Not read through
 * FileUtils.getExternalDirPath: its module can close the plugin on an error (Ink2Pic #13). Each
 * plugin names its own folders under it; a firmware that moves the root changes only this line.
 */
export const SHARED_ROOT = '/storage/emulated/0';
