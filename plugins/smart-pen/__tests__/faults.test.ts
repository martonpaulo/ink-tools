/** The failure a device round arms (#257): the next «Convert to Text» fails once, then converts again. */
import {convertLasso} from '../src/modules/text/lasso';
import {setLastConversion} from '@ink-tools/ink-core/conversion';
import {ARMED_FAILURE, armConvertFailure, withArmedFailure} from '../src/faults';
import {fakeTablet} from '../test-support/host';
import {stroke} from '../../../packages/ink-core/testing/ink';

beforeEach(() => setLastConversion(null));

function lassoedWord() {
  const tablet = fakeTablet('word');
  tablet.lassoStrokes([stroke(100, 200, 200, 60)]);
  const recognize = tablet.host.recognizeElements;
  const logs: string[] = [];
  const host = {...tablet.host, recognizeElements: withArmedFailure(recognize), log: (line: string) => logs.push(line)};
  return {tablet, host, recognize, logs};
}

test('an armed failure fails the next Convert to Text before the recognition runs, and keeps the page', async () => {
  const {tablet, host, recognize, logs} = lassoedWord();
  armConvertFailure();
  expect(await convertLasso(host)).toBe('failed');
  expect(recognize).not.toHaveBeenCalled();
  expect(tablet.host.batchUpdatePageElements).not.toHaveBeenCalled();
  expect(logs).toContain(`lasso kept: recognizeElements ${ARMED_FAILURE}`);
});

test('the failure answers once: the next Convert to Text runs the recognition again', async () => {
  const first = lassoedWord();
  armConvertFailure();
  expect(await convertLasso(first.host)).toBe('failed');
  const second = lassoedWord();
  expect(await convertLasso(second.host)).toBe('converted');
  expect(second.recognize).toHaveBeenCalledTimes(1);
});

test('with nothing armed the recognition runs as it is', async () => {
  const {host, recognize} = lassoedWord();
  expect(await convertLasso(host)).toBe('converted');
  expect(recognize).toHaveBeenCalledTimes(1);
});
