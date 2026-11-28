/**
 * The pack store's values, each owned once in `values.json` (#503): the catalog URL, the store's
 * folder inside the shared folder, its file names and every size limit. Tool code reads them here,
 * never as literals; the `pack` rule of `scripts/boundaries.py` fails on a literal elsewhere.
 */
import {REGISTRY} from '@ink-tools/sn-adapter/registry';
import config from './values.json';

export type PackConfig = {
  /** The list of the packs one can download, published with the packs (#484). */
  catalogUrl: string;
  /** The store's folder, inside the registry's shared folder (`storage.shared-folder`, #499). */
  storeFolder: string;
  /** The catalog of the installed packs, in the store's folder. */
  catalogFile: string;
  /** A download is written under its final name plus this suffix, then moved once its hash is right. */
  partSuffix: string;
  /** The largest pack the store takes, in bytes. */
  maxPackBytes: number;
  /** The free space a download leaves on the tablet beyond the pack itself, in bytes. */
  freeSpaceMarginBytes: number;
};

export const PACK_CONFIG: PackConfig = config;

/** The store's folder: the shared folder of the registry, then `storeFolder`. */
export const PACK_STORE_FOLDER = `${REGISTRY.storageSharedFolder.folder}/${PACK_CONFIG.storeFolder}`;

/** The installed catalog's path. */
export const PACK_CATALOG_PATH = `${PACK_STORE_FOLDER}/${PACK_CONFIG.catalogFile}`;
