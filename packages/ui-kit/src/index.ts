/** The one Settings look every plugin shares (#50, #93): tokens, shared styles, the Button, the Back key
 * (#204). The size rule for tests is `@ink-tools/ui-kit/screenBreaks` and the Back key's test
 * support `@ink-tools/ui-kit/backKeyTest`, both kept out of this entry and so out of the bundle. */
export {metrics} from './metrics';
export {shared, STATUS_LINES} from './styles';
export {Button} from './Button';
export type {ButtonProps} from './Button';
export {createWorking, WORKING_TEXT, WORKING_TIMEOUT_MS} from './working';
export type {Working, WorkingPorts, WorkingRun} from './working';
export {useWorking, WorkingStrip} from './WorkingStrip';
export {useBackKey} from './backKey';
