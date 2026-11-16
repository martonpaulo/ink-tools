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
  Sender,
  textOffer,
  uploadUrl,
} from '../localsend/protocol';
import {Relay} from '../native';
import {copy} from '../copy';
import {failureText, TIMEOUTS} from './sendPng';

/** Offers one text and, when the receiver asks for it, uploads its bytes; answers the toast line. */
export async function sendText(
  native: Relay,
  sender: Sender,
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
  const prepared = await native.post(
    prepareUploadUrl(device),
    {'Content-Type': 'application/json'},
    prepareUploadBody(sender, offer),
    null,
    pinned,
    TIMEOUTS.connectMs,
    TIMEOUTS.prepareMs,
  );
  if (!prepared.ok) {
    return failureText(device, prepared.moduleCode);
  }
  const session = parseTextPrepare(prepared.value.status, prepared.value.body, offer.id);
  if (session.kind !== 'session') {
    return copy.result(session, device.alias);
  }
  const uploaded = await native.post(
    uploadUrl(device, session, offer.id),
    {'Content-Type': 'text/plain; charset=utf-8'},
    text,
    null,
    pinned,
    TIMEOUTS.connectMs,
    TIMEOUTS.uploadMs,
  );
  if (!uploaded.ok) {
    return failureText(device, uploaded.moduleCode);
  }
  return copy.result(parseUpload(uploaded.value.status), device.alias);
}
