/** The start-up notice of a Supernote update that turned a feature off (#492), with fake registry items. */
import {firmwareNoticeTests} from '@ink-tools/ui-kit/firmwareTest';
import {checkFirmware, STILL_WORKS, WATCH} from '../src/firmware';
import {working} from '../src/working';

firmwareNoticeTests({check: checkFirmware, watch: WATCH, stillWorks: STILL_WORKS, working});
