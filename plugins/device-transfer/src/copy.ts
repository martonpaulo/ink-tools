/** Every line Relay shows (#98, #49), in one place. */
import {SendResult} from './localsend/protocol';

export const copy = {
  title: 'Device Transfer',
  sendPage: 'Send Page',
  sendSelection: 'Send Selection',
  sendText: 'Send Text',
  /** Toasts that replace the «Loading…» strip (#103). */
  workingFailed: 'Device Transfer stopped with an error.',
  workingTimeout: 'Device Transfer is still working.',
  readingText: 'Reading the handwriting…',
  noText: 'No text recognized',
  cancel: 'Cancel',
  close: 'Close',
  devices: 'Send to',
  /** The second line of a receiver whose alias another one shares (#307). */
  twinDevice: (model: string | undefined, tail: string) =>
    model === undefined ? `ends ${tail}` : `${model} · ends ${tail}`,
  listedFirst: 'Listed first',
  searching: 'Searching for LocalSend devices…',
  searchAgain: 'Search again',
  noDevice: 'No LocalSend device found',
  chosen: (alias: string) => `${alias} is listed first on each send`,
  noImage: 'Could not make the picture',
  nothingSelected: 'Nothing selected',
  unreachable: (alias: string) => `${alias} not reachable`,
  noAnswer: (alias: string) => `${alias} did not accept in time`,
  identityChanged: (alias: string) =>
    `${alias} identity changed, not sent`,
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
  refusedOffer: 'Device Transfer takes one text, one picture or one PDF',
  tooLarge: 'The file is over 30 MB',
  receivedPdf: (name: string, pages: number) =>
    `${name} made with ${pages} ${pages === 1 ? 'page' : 'pages'}`,
  pdfBroken: 'Could not read the PDF',
  pdfTooManyPages: (max: number) => `The PDF has more than ${max} pages`,
  pdfNoNote: 'Could not make the note',
  noNote: 'Open a note first',
  insertFailed: 'Could not add it to the note',
  permissionReason:
    'Device Transfer sends and receives pages, pictures and texts over LocalSend',
  permissionNames: {
    'plugin.permission.INTERNET': 'Network',
    'plugin.permission.FILE:READ': 'File read',
    'plugin.permission.FILE:WRITE': 'File write',
  } as Record<string, string>,
  permissionRefused: (name: string) =>
    `${name} permission not allowed: allow it in Settings > Apps > Plugins > Device Transfer`,
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
