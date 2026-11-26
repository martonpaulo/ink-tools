/**
 * The device Back key (#204): PluginHost leaves a plugin's full view open on Back unless the plugin
 * closes it (`docs/supernote.md` › Plugins), so each view hands its own exit here, the same as its
 * close or cancel button. The key always ends here: `onBack` does nothing while work is in flight.
 * shortcut: the Manta's PluginHost 1.00.2610150 never emits `hardwareBackPress` to a plugin view,
 * so this runs only on a host that does; each full view keeps a visible «Close». Upgrade to a
 * native key listener only if a device round shows one receives the key.
 */
import {useContext, useEffect, useRef} from 'react';
import {BackHandler, RootTagContext} from 'react-native';

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

/**
 * Runs `arm` once per root view of the plugin, with its root tag: each plugin arms sn-adapter's
 * native Back key module there, so the key reaches `useBackKey` and never the note behind the view
 * (#226, #300). Call it before any early return of the plugin's root component.
 */
export function useArmOnRoot(arm: (rootTag: number) => void): void {
  const rootTag = useContext(RootTagContext);
  useEffect(() => {
    arm(rootTag);
    // Once per root view: the native listener outlives each show of the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootTag]);
}
