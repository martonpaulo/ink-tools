/**
 * The view of the «Loading…» strip (#103, owner A7): one dark strip across the top, the rest of
 * the view clear, so the note shows below when the host draws the view over it. Static text, no
 * spinner: each frame of an animation costs an e-ink refresh.
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useBackKey} from './backKey';
import {metrics} from './metrics';
import {Working, WORKING_TEXT} from './working';

/** Whether `working` shows its strip now, kept current. */
export function useWorking(working: Working): boolean {
  const [on, setOn] = useState(working.isWorking());
  useEffect(() => {
    setOn(working.isWorking());
    return working.subscribe(setOn);
  }, [working]);
  return on;
}

/** Back does nothing while the strip shows (#204): the run ends by itself, with its toast. */
const ignoreBack = () => undefined;

export function WorkingStrip() {
  useBackKey(ignoreBack);
  return (
    <View style={styles.view} pointerEvents="none">
      <View
        style={styles.strip}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={WORKING_TEXT}
        accessibilityLiveRegion="polite"
        testID="working-strip">
        <Text style={styles.text}>{WORKING_TEXT}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: {flex: 1, backgroundColor: 'transparent'},
  strip: {
    minHeight: metrics.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: metrics.screenPadding,
    backgroundColor: metrics.ink,
  },
  text: {fontSize: metrics.fontBody, color: metrics.paper},
});
