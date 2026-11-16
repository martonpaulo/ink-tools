/** Every line Relay shows (#98, #49), in one place. */
import {SendResult} from './localsend/protocol';

export const copy = {
  title: 'Relay',
  sendPage: 'Send page',
  sendSelection: 'Send selection',
  devices: 'Send to',
  searching: 'Searching for LocalSend devices…',
  searchAgain: 'Search again',
  noDevice: 'No LocalSend device found',
  chosen: (alias: string) => `Sends go to ${alias}`,
  noImage: 'Could not make the picture',
  nothingSelected: 'Nothing selected',
  unreachable: (alias: string) => `${alias} not reachable`,
  identityChanged: (alias: string) =>
    `${alias} identity changed, choose it again`,
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
  refusedOffer: 'Relay takes one text, one picture or one PDF',
  tooLarge: 'The file is over 30 MB',
  receivedPdf: (name: string, pages: number) =>
    `${name} made with ${pages} ${pages === 1 ? 'page' : 'pages'}`,
  pdfBroken: 'Could not read the PDF',
  pdfTooManyPages: (max: number) => `The PDF has more than ${max} pages`,
  pdfNoNote: 'Could not make the note',
  noNote: 'Open a note first',
  insertFailed: 'Could not add it to the note',
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
