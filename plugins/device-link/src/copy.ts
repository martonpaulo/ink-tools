/** Every line Relay shows (#98, #49), in one place. */
import {SendResult} from './localsend/protocol';

export const copy = {
  title: 'Device Link',
  sendPage: 'Send Page',
  sendSelection: 'Send Selection',
  sendText: 'Send Text',
  /** Toasts that replace the «Loading…» strip (#103). */
  workingFailed: 'Device Link stopped with an error.',
  workingTimeout: 'Device Link is still working.',
  readingText: 'Reading the handwriting…',
  noText: 'No text recognized',
  cancel: 'Cancel',
  devices: 'Send to',
  /** The second line of a receiver whose alias another one shares (#307). */
  twinDevice: (model: string | undefined, tail: string) =>
    model === undefined ? `ends ${tail}` : `${model} · ends ${tail}`,
  listedFirst: 'Show first when sending',
  searching: 'Searching for LocalSend devices…',
  searchAgain: 'Search again',
  noDevice: 'No LocalSend device found',
  chosen: (alias: string) => `${alias} shows first when you send`,
  sending: (alias: string) => `Sending to ${alias}…`,
  noImage: 'Could not make the picture',
  nothingSelected: 'Nothing selected',
  unreachable: (alias: string) => `${alias} not reachable`,
  noAnswer: (alias: string) => `${alias} did not accept in time`,
  identityChanged: (alias: string) =>
    `${alias} identity changed, not sent. Pick it in Device Link Settings to trust it again.`,
  notLocal: (alias: string) => `${alias} is not on this network`,
  receive: 'Receive',
  ready: (alias: string) => `Ready to receive as ${alias}`,
  readyHint: 'Send a text, a picture or a PDF from LocalSend on the iPhone or the Mac.',
  starting: 'Starting…',
  stop: 'Stop',
  receivedText: 'Text added to the note',
  receivedImage: 'Picture added to the note',
  nothingArrived: 'Nothing arrived',
  receiveStopped: 'Receiving stopped',
  receiveFailed: 'Could not start receiving',
  notAnImage: 'Send a JPEG, a PNG or a PDF',
  refusedOffer: 'Device Link takes one text, one picture or one PDF',
  tooLarge: 'The file is over 30 MB',
  receivedPdf: (name: string, pages: number) =>
    `${name} made with ${pages} ${pages === 1 ? 'page' : 'pages'}`,
  pdfBroken: 'Could not read the PDF',
  pdfTooManyPages: (max: number) => `The PDF has more than ${max} pages`,
  pdfNoNote: 'Could not make the note',
  noNote: 'Open a note first',
  /** A background receive with no note open (#289): the item waits for the next open note. */
  keptForNote: 'Received: it goes into the next note you write in',
  receiveInBackground: 'Receive in the background',
  receiveInBackgroundHint: 'Takes what LocalSend sends while the tablet is awake.',
  receiveInBackgroundNote:
    'You do not need to open Receive. Each text or picture goes into the open note, or waits for the next note you write in. Stop turns it off.',
  /** A background receive that failed (#289): the switch now reads off, and this says why. */
  backgroundStopped: (why: string) => `Receiving in the background stopped: ${why}`,
  insertFailed: 'Could not add it to the note',
  permissionReason:
    'Device Link sends and receives pages, pictures and texts over LocalSend',
  permissionNames: {
    'plugin.permission.INTERNET': 'Network',
    'plugin.permission.FILE:READ': 'File read',
    'plugin.permission.FILE:WRITE': 'File write',
  } as Record<string, string>,
  /** The Needs state of a refused permission (#256): what is missing, then the steps that allow it. */
  permissionNeeded: (name: string) =>
    `Device Link needs the ${name} permission`,
  permissionSteps: (name: string) => [
    'Open Settings > Apps > Plugins > Device Link.',
    `Allow ${name}.`,
    'Press the button again.',
  ],
  /** The Error state's reason under a send that failed on the tablet (#256). */
  sendFailedReason: 'Close, then press the button again.',
  permissionRefused: (name: string) =>
    `${name} permission not allowed: allow it in Settings > Apps > Plugins > Device Link`,
  result(result: SendResult, alias: string): string {
    switch (result.kind) {
      case 'sent':
        return `Sent to ${alias}`;
      case 'declined':
        return `${alias} declined`;
      case 'refused':
        return `${alias} refused the file`;
      case 'busy':
        return `${alias} is busy with another transfer`;
      case 'failed':
        return `${alias} answered ${result.status}`;
    }
  },
};
