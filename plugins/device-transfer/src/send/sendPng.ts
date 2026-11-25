/**
 * The send flow (#98): make the PNG, offer it to the picked receiver (#307), upload it, say how it went,
 * and remove the PNG on every path.
 */
import {
  EMPTY_LASSO_CODE,
  getPluginDirPath,
  Result,
} from '@ink-tools/sn-adapter/official';
import {
  announce,
  Device,
  isPrivateAddress,
  LOCALSEND_PORT,
  MULTICAST_GROUP,
  parseAnnounce,
  parsePrepareUpload,
  parseUpload,
  prepareUploadBody,
  prepareUploadUrl,
  receiverInfo,
  Sender,
  uploadUrl,
} from '../localsend/protocol';
import {FileInfo, HttpAnswer, Relay} from '../native';
import {copy} from '../copy';
import {
  loadSettings,
  movedDevice,
  sameAddress,
  saveSettings,
  Self,
} from '../settings/device';

/** Plan › Failure behaviour: every network step has its own limit. */
export const TIMEOUTS = {
  discoverMs: 3000,
  connectMs: 3000,
  // LocalSend answers the offer only once the person accepts it, at the Mac or the iPhone: on the
  // tablet, 10 s ran out with the offer shown (#98).
  prepareMs: 60000,
  uploadMs: 30000,
} as const;

/**
 * Relay's temporary folder, inside its private folder (`getPluginDirPath`): a shared path such as
 * `/storage/emulated/0/Relay/tmp` is outside PluginHost's whitelist, so every write and delete
 * there fails (#164, `docs/supernote.md` › Plugins). It holds the sent PNGs, the received files
 * and the PDF pages.
 */
export function tempDir(pluginDir: string): string {
  return `${pluginDir}/tmp`;
}

/** What one send ends in: a line for the toast. */
export type Outcome = {kind: 'toast'; text: string};

/** Called with the receiver at the address that took the item, once it was sent (#307). */
export type Delivered = (target: Device) => Promise<void>;

/**
 * Every receiver that answers one announce, by multicast or by `/register`, one per fingerprint,
 * in answer order. LocalSend registers with the announcer first and answers by multicast only when
 * that fails, so the window serves `/register` with our identity (#98); without the private folder
 * only multicast answers count.
 */
export async function discoverDevices(
  native: Relay,
  sender: Sender,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Promise<Result<Device[]>> {
  const dir = await pluginDir();
  const answers = await native.discover(
    MULTICAST_GROUP,
    LOCALSEND_PORT,
    announce(sender),
    TIMEOUTS.discoverMs,
    dir.ok ? dir.value : null,
    receiverInfo(sender),
  );
  if (!answers.ok) {
    return answers;
  }
  const seen = new Map<string, Device>();
  for (const answer of answers.value) {
    const device = parseAnnounce(answer.text, answer.ip, sender);
    if (device !== null && !seen.has(device.fingerprint)) {
      seen.set(device.fingerprint, device);
    }
  }
  return {ok: true, value: [...seen.values()]};
}

/** One line of a send in the log (#98): steps, status codes, timings and the toast, never a body. */
export function sendLog(line: string): void {
  console.log(`Relay: send: ${line}`);
}

/**
 * One POST of a send, logged as `<step> <status> in <ms> ms`, or `<step> failed: <code>
 * <exception> in <ms> ms`, so a device round sees where a send stops (#98).
 */
export async function loggedPost(
  step: string,
  post: () => Promise<Result<HttpAnswer>>,
  now: () => number = Date.now,
): Promise<Result<HttpAnswer>> {
  const start = now();
  const answer = await post();
  const ms = now() - start;
  sendLog(
    answer.ok
      ? `${step} ${answer.value.status} in ${ms} ms`
      : `${step} failed: ${answer.moduleCode ?? answer.code} ${answer.message} in ${ms} ms`,
  );
  return answer;
}

/** Where a send goes, for the log (#98): the address, port and protocol, never the pin. */
export function targetLine(device: Device): string {
  return `to ${device.alias} at ${device.ip}:${device.port} over ${device.protocol}`;
}

/** The picked receiver at the address a new discovery finds it, saved; null when not found. */
export type Relocate = (device: Device) => Promise<Device | null>;

/**
 * Looks for `device` again by its fingerprint and saves it as the last pick when it moved (#98,
 * #307): a Mac keeps its certificate across a DHCP lease, not its address, and a connect to the
 * saved one fails.
 */
export function findAgain(
  native: Relay,
  sender: Sender,
  pluginDir: () => Promise<Result<string>> = getPluginDirPath,
): Relocate {
  return async device => {
    const found = await discoverDevices(native, sender, pluginDir);
    const moved = found.ok ? movedDevice(device, found.value) : null;
    if (moved !== null) {
      const settings = await loadSettings(native, pluginDir);
      await saveSettings(native, {...settings, last: moved}, pluginDir);
    }
    return moved;
  };
}

/**
 * One try of a send: its toast line, whether its offer never reached the receiver, and whether the
 * receiver took the item.
 */
export type Attempt = {text: string; unreachable: boolean; sent: boolean};

/**
 * Runs `attempt` at the device's saved address; when its offer cannot connect, `relocate` looks
 * for the device by its fingerprint, and one more attempt goes to its new address. Only an offer
 * is tried again, since nothing reached the receiver yet. Each target is logged (#98); the target
 * that took the item goes to `delivered` (#307).
 */
export async function withRelocation(
  device: Device,
  relocate: Relocate | undefined,
  attempt: (target: Device) => Promise<Attempt>,
  delivered?: Delivered,
): Promise<string> {
  const tried = await relocated(device, relocate, attempt);
  if (tried.sent && delivered !== undefined) {
    await delivered(tried.target);
  }
  return tried.text;
}

async function relocated(
  device: Device,
  relocate: Relocate | undefined,
  attempt: (target: Device) => Promise<Attempt>,
): Promise<Attempt & {target: Device}> {
  sendLog(targetLine(device));
  const first = await attempt(device);
  if (!first.unreachable || relocate === undefined) {
    return {...first, target: device};
  }
  const moved = await relocate(device);
  if (moved === null || sameAddress(moved, device)) {
    sendLog(`${device.alias} found at no other address`);
    return {...first, target: device};
  }
  sendLog(targetLine(moved));
  return {...(await attempt(moved)), target: moved};
}

/**
 * True when a failed POST never reached the receiver: a dead address, a closed port or a timeout
 * before TLS ended; not a changed identity, nor an offer the receiver holds (`NO_ANSWER`).
 */
export function unreachable(moduleCode: string | undefined): boolean {
  return moduleCode === 'IO' || moduleCode === 'TIMEOUT';
}

/**
 * The toast for a failed POST: a changed identity, an offer not accepted in time, else not
 * reachable. Only an offer waits for the person, so an upload with no answer is not reachable.
 */
export function failureText(
  device: Device,
  moduleCode: string | undefined,
  step: 'offer' | 'upload' = 'offer',
): string {
  if (moduleCode === 'IDENTITY') {
    return copy.identityChanged(device.alias);
  }
  return moduleCode === 'NO_ANSWER' && step === 'offer'
    ? copy.noAnswer(device.alias)
    : copy.unreachable(device.alias);
}

/**
 * Offers and uploads one PNG, at the device's new address when the saved one does not answer
 * (`relocate`); the answer is the toast line, and a sent PNG's target goes to `delivered`.
 */
export async function sendFile(
  native: Relay,
  sender: Self,
  device: Device,
  path: string,
  fileName: string,
  relocate?: Relocate,
  delivered?: Delivered,
): Promise<string> {
  if (!isPrivateAddress(device.ip)) {
    return copy.notLocal(device.alias);
  }
  const info = await native.fileInfo(path);
  if (!info.ok) {
    return copy.noImage;
  }
  return withRelocation(
    device,
    relocate,
    target => offerFile(native, sender, target, path, fileName, info.value),
    delivered,
  );
}

async function offerFile(
  native: Relay,
  sender: Self,
  device: Device,
  path: string,
  fileName: string,
  info: FileInfo,
): Promise<Attempt> {
  const pinned = device.protocol === 'https' ? device.fingerprint : null;
  const fileId = 'image';
  const prepared = await loggedPost('prepare-upload', () =>
    native.post(
      prepareUploadUrl(device),
      {'Content-Type': 'application/json'},
      prepareUploadBody(sender, {
        id: fileId,
        fileName,
        size: info.size,
        fileType: 'image/png',
        sha256: info.sha256,
      }),
      null,
      pinned,
      sender.identityFolder,
      TIMEOUTS.connectMs,
      TIMEOUTS.prepareMs,
    ),
  );
  if (!prepared.ok) {
    return {
      text: failureText(device, prepared.moduleCode),
      unreachable: unreachable(prepared.moduleCode),
      sent: false,
    };
  }
  const session = parsePrepareUpload(
    prepared.value.status,
    prepared.value.body,
    fileId,
  );
  if (session.kind !== 'session') {
    return {
      text: copy.result(session, device.alias),
      unreachable: false,
      sent: session.kind === 'sent',
    };
  }
  const uploaded = await loggedPost('upload', () =>
    native.post(
      uploadUrl(device, session, fileId),
      {'Content-Type': 'image/png'},
      null,
      path,
      pinned,
      sender.identityFolder,
      TIMEOUTS.connectMs,
      TIMEOUTS.uploadMs,
    ),
  );
  const result = uploaded.ok ? parseUpload(uploaded.value.status) : null;
  const text =
    result !== null
      ? copy.result(result, device.alias)
      : failureText(device, uploaded.ok ? undefined : uploaded.moduleCode, 'upload');
  return {text, unreachable: false, sent: result?.kind === 'sent'};
}

/**
 * One send to the picked device (#307): `make` writes the PNG in `tmp` (`tempDir`), which is sent
 * and then removed, whatever happened. The outcome is logged, the toast line too, since the host's
 * toast leaves no text in the log (#98).
 */
export async function sendCapture(
  native: Relay,
  sender: Self,
  device: Device,
  tmp: string,
  name: string,
  make: (pngPath: string) => Promise<Result<string>>,
  now: () => number = Date.now,
  relocate?: Relocate,
  delivered?: Delivered,
): Promise<Outcome> {
  const outcome = await capture(
    native,
    sender,
    device,
    tmp,
    name,
    make,
    now,
    relocate,
    delivered,
  );
  sendLog(`${name}: ${outcome.text}`);
  return outcome;
}

async function capture(
  native: Relay,
  sender: Self,
  device: Device,
  tmp: string,
  name: string,
  make: (pngPath: string) => Promise<Result<string>>,
  now: () => number,
  relocate: Relocate | undefined,
  delivered: Delivered | undefined,
): Promise<Outcome> {
  const fileName = `${name}-${now()}.png`;
  const pngPath = `${tmp}/${fileName}`;
  let written: string | null = null;
  try {
    const made = await make(pngPath);
    if (!made.ok) {
      return {
        kind: 'toast',
        text:
          made.code === EMPTY_LASSO_CODE ? copy.nothingSelected : copy.noImage,
      };
    }
    written = made.value;
    return {
      kind: 'toast',
      text: await sendFile(
        native,
        sender,
        device,
        written,
        fileName,
        relocate,
        delivered,
      ),
    };
  } finally {
    await native.remove(pngPath);
    if (written !== null && written !== pngPath) {
      await native.remove(written);
    }
  }
}
