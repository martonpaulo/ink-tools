/**
 * Test support for the Needs and Error states a plugin holds on its working view (#256): a working
 * with quiet ports, and the parts of the rendered state a test reads. Kept out of the entry, so
 * out of the bundle, as `backKeyTest` is.
 */
import {Text} from 'react-native';
import type {ReactTestInstance} from 'react-test-renderer';
import {CLOSE_TEXT} from './problem';
import {createWorking, Working} from './working';

/** A working whose view calls do nothing, with the plugin's own failure and timeout lines. */
export function quietWorking(copy: {failed: string; timeout: string}): Working {
  return createWorking({
    show: async () => undefined,
    close: async () => undefined,
    toast: () => undefined,
    log: () => undefined,
    copy,
  });
}

/** Every text the rendered tree shows, in order. */
export function shownTexts(root: ReactTestInstance): unknown[] {
  return root.findAllByType(Text).map(node => node.props.children);
}

/** The pressable controls named `label`; Close by default, the title bar's ×. */
export function pressables(root: ReactTestInstance, label: string = CLOSE_TEXT): ReactTestInstance[] {
  return root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}
