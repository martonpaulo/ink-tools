/** The Manta's pixel ratio, so the ui-kit tokens convert millimetres as on the device (brief 8.4). */
import {PixelRatio} from 'react-native';

jest.spyOn(PixelRatio, 'get').mockReturnValue(1.875);
