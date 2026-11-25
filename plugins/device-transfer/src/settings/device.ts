/**
 * Relay's settings (#98): the chosen receiver, with the fingerprint it is pinned to, and our own
 * fingerprint for the announce. One small JSON file in the private folder, since a shared path
 * outside PluginHost's whitelist cannot be written (#164); an unreadable file is a fresh start,
 * never a crash.
 */
import {getPluginDirPath, Result} from '@ink-tools/sn-adapter/official';
import {Device, isPrivateAddress, Sender} from '../localsend/protocol';
import {Relay} from '../native';

export function settingsPath(pluginDir: string): string {
  return `${pluginDir}/settings.json`;
}

export type Settings = {
  /** Who we are to a receiver; made once, kept. */
  fingerprint: string;
  /** The receiver every send goes to, or null until the person picks one. */
  device: Device | null;
};

function newFingerprint(random: () => number): string {
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += Math.floor(random() * 16).toString(16);
  }
  return text;
}

function readDevice(value: unknown): Device | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const d = value as Record<string, unknown>;
  if (
    typeof d.alias !== 'string' ||
    typeof d.ip !== 'string' ||
    !isPrivateAddress(d.ip) ||
    typeof d.port !== 'number' ||
    (d.protocol !== 'https' && d.protocol !== 'http') ||
    typeof d.fingerprint !== 'string'
  ) {
    return null;
  }
  return {
    alias: d.alias,
    ip: d.ip,
    port: d.port,
    protocol: d.protocol,
    fingerprint: d.fingerprint,
  };
}

/**
 * The saved device as a new discovery finds it, by fingerprint, when its address, port, protocol
 * or name moved; null when it is not found or nothing moved. A receiver keeps its certificate but
 * not its address: on the tablet, a Mac saved at one DHCP address was sent to there after it got
 * another, and every send read «not reachable» (#98).
 */
export function movedDevice(saved: Device | null, found: Device[]): Device | null {
  const now = saved && found.find(each => each.fingerprint === saved.fingerprint);
  if (!saved || !now) {
    return null;
  }
  return now.alias === saved.alias && sameAddress(now, saved)
    ? null
    : readDevice(now);
}

/** True when two receivers are reached the same way: address, port and protocol. */
export function sameAddress(a: Device, b: Device): boolean {
  return a.ip === b.ip && a.port === b.port && a.protocol === b.protocol;
}

/** The saved settings; a missing or unreadable file gives a new fingerprint and no device. */
export async function loadSettings(
  native: Relay,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
  random: () => number = Math.random,
): Promise<Settings> {
  const dir = await pluginDir();
  const read = dir.ok ? await native.readText(settingsPath(dir.value)) : dir;
  let parsed: Record<string, unknown> = {};
  if (read.ok && read.value !== null) {
    try {
      const value = JSON.parse(read.value);
      if (value !== null && typeof value === 'object') {
        parsed = value;
      }
    } catch {
      // An unreadable file is a fresh start.
    }
  }
  const fingerprint =
    typeof parsed.fingerprint === 'string' && parsed.fingerprint.length > 0
      ? parsed.fingerprint
      : newFingerprint(random);
  return {fingerprint, device: readDevice(parsed.device)};
}

export async function saveSettings(
  native: Relay,
  settings: Settings,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<boolean> {
  const dir = await pluginDir();
  if (!dir.ok) {
    return false;
  }
  const written = await native.writeText(
    settingsPath(dir.value),
    JSON.stringify(settings, null, 2),
  );
  return written.ok;
}

/**
 * Who we are on a send: what we announce, and the folder of the certificate that proves it, our
 * TLS client certificate (#98); null when the identity cannot be read.
 */
export type Self = Sender & {identityFolder: string | null};

/**
 * Our identity to a receiver: the receive half's certificate (#49), so the tablet is one
 * LocalSend device both ways, and its folder, for the client certificate (#98); the saved
 * fingerprint, with no certificate, only while the identity cannot be read.
 */
export async function ownIdentity(
  native: Relay,
  settings: Settings,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Omit<Self, 'alias'>> {
  const dir = await pluginDir();
  if (dir.ok) {
    const identity = await native.identity(dir.value);
    if (identity.ok) {
      return {fingerprint: identity.value, identityFolder: dir.value};
    }
  }
  return {fingerprint: settings.fingerprint, identityFolder: null};
}

/** Our fingerprint alone, for the announce of the Settings view's search. */
export async function ownFingerprint(
  native: Relay,
  settings: Settings,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<string> {
  return (await ownIdentity(native, settings, pluginDir)).fingerprint;
}
