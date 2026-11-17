/**
 * The device Back key (#204): PluginHost leaves a plugin's full view open on Back unless the plugin
 * closes it (`docs/supernote.md` › Plugins), so each view hands its own exit here, the same as its
 * close or cancel button. The key always ends here: `onBack` does nothing while work is in flight.
 */
import {useEffect, useRef} from 'react';
import {BackHandler} from 'react-native';

export function useBackKey(onBack: () => void): void {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        latest.current();
        return true;
      },
    );
    return () => subscription.remove();
  }, []);
}
