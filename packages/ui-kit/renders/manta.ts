/** The Manta's pixel ratio and window, so the ui-kit tokens convert millimetres as on the device (brief 8.4). */
import {Dimensions, PixelRatio} from 'react-native';
import {WINDOW} from './html';

jest.spyOn(PixelRatio, 'get').mockReturnValue(1.875);
// The window the renders lay out in, so a view sized by the window, such as ui-kit's CodeBlock
// (#405), is sized as on the tablet.
const window = {width: WINDOW.width, height: WINDOW.height, scale: 1.875, fontScale: 1};
jest.spyOn(Dimensions, 'get').mockReturnValue(window);
