/**
 * The download of a language pack, size first (#503, #485): before any byte is fetched the user
 * sees the pack's size and says yes; a new version shows its own size again; on a metered network,
 * such as a phone hotspot, the user is asked again even after an earlier yes. What a download and
 * a use need (the network, the shared folder, free space) is declared in `requirements.json`, not
 * code, so a screen shows the missing piece in ui-kit's Needs state before it starts.
 */
import {InstalledCatalog, PackResult, RemotePack, installedPack, packOk} from './catalog';
import {PACK_CONFIG} from './config';
import {PackHost, installPack} from './store';
import requirements from './requirements.json';

/** One thing a pack needs; the plugin's copy names each and the one step that fixes it. */
export type PackRequirement = 'network' | 'shared-folder' | 'free-space';

/** What a download needs, then what a use needs, as `requirements.json` declares them. */
export const PACK_REQUIREMENTS: {download: readonly PackRequirement[]; use: readonly PackRequirement[]} =
  requirements as {download: PackRequirement[]; use: PackRequirement[]};

/** The checks behind the requirements and the metered question, bound by the plugin. */
export type PackNeedsHost = {
  /** True when the tablet has a network now. */
  online: () => Promise<boolean>;
  /** True when the network is metered (a phone hotspot); a failed check counts as metered. */
  metered: () => Promise<boolean>;
  /** True when this tool holds every permission the shared folder needs. */
  sharedFolder: () => Promise<boolean>;
  /** The free bytes in shared storage, or `null` when unknown. */
  freeBytes: () => Promise<number | null>;
};

/** The question a screen asks before a download. */
export type PackQuestion = {
  pack: RemotePack;
  /** The bytes the download takes. */
  bytes: number;
  /** The version already installed, when this is a new version. */
  replaces: string | null;
  /** True on a metered network: the screen says so in the question. */
  metered: boolean;
};

/** Where a download stands before it starts. */
export type DownloadStep =
  | {kind: 'needs'; missing: PackRequirement[]}
  | {kind: 'current'}
  | {kind: 'ask'; question: PackQuestion}
  | {kind: 'go'};

/** A yes the user gave before for one pack version, such as an automatic update they turned on. */
export type PackApproval = {language: string; version: string};

async function missingOf(needs: PackNeedsHost, which: readonly PackRequirement[], bytes: number): Promise<PackRequirement[]> {
  const missing: PackRequirement[] = [];
  for (const requirement of which) {
    if (requirement === 'network' && !(await needs.online())) {
      missing.push(requirement);
    } else if (requirement === 'shared-folder' && !(await needs.sharedFolder())) {
      missing.push(requirement);
    } else if (requirement === 'free-space') {
      const free = await needs.freeBytes();
      // Unknown free space is not enough space: the user is told, never surprised by a full tablet.
      if (free === null || free < bytes + PACK_CONFIG.freeSpaceMarginBytes) {
        missing.push(requirement);
      }
    }
  }
  return missing;
}

/** What a use of the installed packs is missing, for a tool that only reads the store. */
export function missingForUse(needs: PackNeedsHost): Promise<PackRequirement[]> {
  return missingOf(needs, PACK_REQUIREMENTS.use, 0);
}

/**
 * The step before downloading `pack`: what is missing, nothing to do, the question to ask, or go.
 * It asks unless `approval` names this exact version on an unmetered network.
 */
export async function prepareDownload(
  pack: RemotePack,
  installed: InstalledCatalog,
  needs: PackNeedsHost,
  approval: PackApproval | null = null,
): Promise<DownloadStep> {
  const current = installedPack(installed, pack.language);
  if (current && current.version === pack.version && current.sha256 === pack.sha256) {
    return {kind: 'current'};
  }
  const missing = await missingOf(needs, PACK_REQUIREMENTS.download, pack.size);
  if (missing.length) {
    return {kind: 'needs', missing};
  }
  const metered = await needs.metered();
  const approved = approval?.language === pack.language && approval.version === pack.version;
  if (approved && !metered) {
    return {kind: 'go'};
  }
  return {kind: 'ask', question: {pack, bytes: pack.size, replaces: current?.version ?? null, metered}};
}

/** How a download ended. */
export type DownloadEnd =
  | {kind: 'needs'; missing: PackRequirement[]}
  | {kind: 'current'}
  | {kind: 'declined'}
  | {kind: 'installed'};

/**
 * Downloads `pack` after its step: `ask` shows the question and resolves the user's answer. No
 * byte is fetched before a yes, and a failure keeps the store as it was.
 */
export async function downloadPack(
  pack: RemotePack,
  deps: {host: PackHost; needs: PackNeedsHost; installed: InstalledCatalog; ask: (question: PackQuestion) => Promise<boolean>},
  approval: PackApproval | null = null,
): Promise<PackResult<DownloadEnd>> {
  const step = await prepareDownload(pack, deps.installed, deps.needs, approval);
  if (step.kind === 'needs' || step.kind === 'current') {
    return packOk(step);
  }
  if (step.kind === 'ask' && !(await deps.ask(step.question))) {
    return packOk({kind: 'declined'});
  }
  const installed = await installPack(deps.host, pack);
  return installed.ok ? packOk({kind: 'installed'}) : installed;
}
