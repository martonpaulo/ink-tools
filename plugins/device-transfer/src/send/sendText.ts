/**
 * «Send Text» (#99): the lassoed handwriting, recognised on the tablet, goes to the chosen
 * LocalSend device as one text. The person reads it first and can cancel; nothing leaves the
 * tablet before «Send». The recognised text is never logged.
 */
import {
  Device,
  isPrivateAddress,
  parseTextPrepare,
  parseUpload,
  prepareUploadBody,
  prepareUploadUrl,
  textOffer,
  uploadUrl,
} from '../localsend/protocol';
import {Relay} from '../native';
import {copy} from '../copy';
import {Self} from '../settings/device';
import {failureText, loggedPost, sendLog, TIMEOUTS} from './sendPng';

/**
 * Offers one text and, when the receiver asks for it, uploads its bytes; answers the toast line,
 * which is logged too (#98).
 */
export async function sendText(
  native: Relay,
  sender: Self,
  device: Device,
  text: string,
): Promise<string> {
  const line = await offerText(native, sender, device, text);
  sendLog(`text: ${line}`);
  return line;
}

async function offerText(
  native: Relay,
  sender: Self,
  device: Device,
  text: string,
): Promise<string> {
  if (text.trim() === '') {
    return copy.noText;
  }
  if (!isPrivateAddress(device.ip)) {
    return copy.notLocal(device.alias);
  }
  const pinned = device.protocol === 'https' ? device.fingerprint : null;
  const offer = textOffer(text);
  const prepared = await loggedPost('prepare-upload', () =>
    native.post(
      prepareUploadUrl(device),
      {'Content-Type': 'application/json'},
      prepareUploadBody(sender, offer),
      null,
      pinned,
      sender.identityFolder,
      TIMEOUTS.connectMs,
      TIMEOUTS.prepareMs,
    ),
  );
  if (!prepared.ok) {
    return failureText(device, prepared.moduleCode);
  }
  const session = parseTextPrepare(prepared.value.status, prepared.value.body, offer.id);
  if (session.kind !== 'session') {
    return copy.result(session, device.alias);
  }
  const uploaded = await loggedPost('upload', () =>
    native.post(
      uploadUrl(device, session, offer.id),
      {'Content-Type': 'text/plain; charset=utf-8'},
      text,
      null,
      pinned,
      sender.identityFolder,
      TIMEOUTS.connectMs,
      TIMEOUTS.uploadMs,
    ),
  );
  if (!uploaded.ok) {
    return failureText(device, uploaded.moduleCode);
  }
  return copy.result(parseUpload(uploaded.value.status), device.alias);
}
