/**
 * The view of a no-view action's «Loading…» (#103), as the native loading box (#287): a paper box
 * with the thin ink border, centred on the screen, with the ⓘ and «Loading…»; the rest of the view
 * is clear and not dimmed, so the note shows around it when the host draws the view over it. Static,
 * no spinner: each frame of an animation costs an e-ink refresh. After a failure the view shows the
 * Error state, with the reason and Close, until the owner closes it (#255).
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useBackKey} from './backKey';
import {InfoMark} from './marks';
import {metrics} from './metrics';
import {Problem} from './problem';
import {ErrorView} from './ProblemView';
import {shared} from './styles';
import {Working, WORKING_TEXT} from './working';

/** The strip's state, kept current: working, the held failure, or neither. */
function useWorkingState(working: Working): {on: boolean; problem: Problem | null} {
  const read = () => ({on: working.isWorking(), problem: working.problem()});
  const [state, setState] = useState(read);
  useEffect(() => {
    setState(read());
    return working.subscribe(() => setState(read()));
    // `read` reads only `working`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working]);
  return state;
}

/** Whether `working` owns the view now: its strip shows, or its failure waits for Close. */
export function useWorking(working: Working): boolean {
  const {on, problem} = useWorkingState(working);
  return on || problem !== null;
}

/** Back does nothing while the strip shows (#204): the run ends by itself; a failure then holds the Error view (#255). */
const ignoreBack = () => undefined;

export function WorkingStrip({working}: {working: Working}): React.JSX.Element {
  const {on, problem} = useWorkingState(working);
  if (!on && problem !== null) {
    return <ErrorView problem={problem} onClose={() => working.dismiss()} />;
  }
  return <Strip />;
}

function Strip() {
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
        <InfoMark />
        <Text style={[shared.text, styles.text]}>{WORKING_TEXT}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: {flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center'},
  strip: {
    width: metrics.loadingWidth,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.loadingIconGap,
    paddingVertical: metrics.loadingPaddingV,
    paddingHorizontal: metrics.loadingPaddingH,
    borderWidth: metrics.border,
    borderColor: metrics.ink,
    backgroundColor: metrics.paper,
  },
  text: {flexShrink: 1},
});
