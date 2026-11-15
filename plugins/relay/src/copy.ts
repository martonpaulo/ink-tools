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
  readyHint: 'Send a text or a picture from LocalSend on the iPhone or the Mac.',
  starting: 'Starting…',
  stop: 'Stop',
  receivedText: 'Text added to the note',
  receivedImage: 'Picture added to the note',
  nothingArrived: 'Nothing arrived',
  receiveStopped: 'Receiving stopped',
  receiveFailed: 'Could not start receiving',
  notAnImage: 'Send the photo as JPEG or PNG',
  refusedOffer: 'Relay takes one text or one picture',
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
