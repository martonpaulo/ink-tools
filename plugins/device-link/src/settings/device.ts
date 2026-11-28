/**
 * Relay's settings (#98, #307): each receiver's pinned fingerprint by alias, the receiver picked
 * last, listed first, and our own fingerprint for the announce. One small JSON file in the private folder, since a shared path
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
  /**
   * Each receiver's fingerprint by alias, pinned on the first item it took (#307): a known alias
   * that announces another fingerprint is refused, never pinned again.
   */
  pins: Record<string, string>;
  /** The receiver picked last, listed first on the next send; null before the first pick. */
  last: Device | null;
  /** «Receive in the background» (#289): a receiver started at plugin start; off by default. */
  background: boolean;
};

/** What a receiver's announced fingerprint is to its pin (#307). */
export type PinCheck = 'new' | 'same' | 'changed';

/** `new` for an alias never sent to, `same` for its pinned fingerprint, else `changed`. */
export function checkPin(settings: Settings, device: Device): PinCheck {
  const pin = Object.prototype.hasOwnProperty.call(settings.pins, device.alias)
    ? settings.pins[device.alias]
    : undefined;
  if (pin === undefined) {
    return 'new';
  }
  return pin === device.fingerprint ? 'same' : 'changed';
}

/**
 * The settings once `device` took an item: its fingerprint pinned when its alias is new, and it is
 * the last pick. A changed fingerprint keeps the old pin (#307).
 */
export function afterSent(settings: Settings, device: Device): Settings {
  const pins =
    checkPin(settings, device) === 'new'
      ? {...settings.pins, [device.alias]: device.fingerprint}
      : settings.pins;
  return {...settings, pins, last: device};
}

/**
 * The settings once `device` is picked in Settings: the last pick, and its current fingerprint
 * pinned, so a receiver whose identity changed is trusted again only by this explicit pick (#307).
 */
export function trusted(settings: Settings, device: Device): Settings {
  return {
    ...settings,
    pins: {...settings.pins, [device.alias]: device.fingerprint},
    last: device,
  };
}

/** The found receivers with the last pick first, the rest in answer order (#307). */
export function lastFirst(found: Device[], last: Device | null): Device[] {
  const first = last && found.find(each => each.fingerprint === last.fingerprint);
  return first ? [first, ...found.filter(each => each !== first)] : found;
}

/** Only string fingerprints by string alias; anything else in the file is dropped. */
function readPins(value: unknown): Record<string, string> {
  const pins: Record<string, string> = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return pins;
  }
  for (const [alias, fingerprint] of Object.entries(value)) {
    if (typeof fingerprint === 'string' && fingerprint.length > 0) {
      pins[alias] = fingerprint;
    }
  }
  return pins;
}

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

/**
 * The settings once a search finds the last pick, by its fingerprint, under a new alias (#98): the
 * last pick takes the current name and address, so the next send and «Sends go to …» show the
 * receiver as it is named now, and the new alias is pinned to the same fingerprint. Null when
 * nothing was renamed, or when the new alias is already pinned to another receiver, which is never
 * taken over. The old alias keeps its pin.
 */
export function renamed(settings: Settings, found: Device[]): Settings | null {
  const last = settings.last;
  const now = last && found.find(each => each.fingerprint === last.fingerprint);
  if (!last || !now || now.alias === last.alias || checkPin(settings, now) === 'changed') {
    return null;
  }
  const device = readDevice(now);
  return device === null
    ? null
    : {...settings, pins: {...settings.pins, [device.alias]: device.fingerprint}, last: device};
}

/** True when two receivers are reached the same way: address, port and protocol. */
export function sameAddress(a: Device, b: Device): boolean {
  return a.ip === b.ip && a.port === b.port && a.protocol === b.protocol;
}

/**
 * The saved settings; a missing or unreadable file gives a new fingerprint, no pin and no last
 * pick. A file from before #307, with one chosen `device`, keeps it as the last pick and its pin.
 */
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
  const pins = readPins(parsed.pins);
  const last = readDevice('last' in parsed ? parsed.last : parsed.device);
  if (last !== null && !('pins' in parsed)) {
    pins[last.alias] = last.fingerprint;
  }
  return {fingerprint, pins, last, background: parsed.background === true};
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
