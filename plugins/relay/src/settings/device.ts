/**
 * Relay's settings (#98): the chosen receiver, with the fingerprint it is pinned to, and our own
 * fingerprint for the announce. One small JSON file in the private folder, since a shared path
 * outside PluginHost's whitelist cannot be written (#164); an unreadable file is a fresh start,
 * never a crash.
 */
import {getPluginDirPath, Result} from '@supernote-tools/sn-adapter/official';
import {Device, isPrivateAddress} from '../localsend/protocol';
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
 * Our fingerprint to a receiver: the receive half's certificate (#49), so the tablet is one
 * LocalSend device both ways; the saved one only while the identity cannot be read.
 */
export async function ownFingerprint(
  native: Relay,
  settings: Settings,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<string> {
  const dir = await pluginDir();
  if (dir.ok) {
    const identity = await native.identity(dir.value);
    if (identity.ok) {
      return identity.value;
    }
  }
  return settings.fingerprint;
}
