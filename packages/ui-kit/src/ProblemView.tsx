/**
 * The full-view states a tool shows when it cannot go on, or waits (#245, #255): `Needs` after a
 * check, `ErrorView` after a failure, `LoadingView` while a full view loads. Each is one column
 * under the title bar with its ×, and stays until the owner closes it. Static text only: each
 * frame of an animation costs an e-ink refresh.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useBackKey} from './backKey';
import {Button} from './Button';
import {CodeBlock} from './CodeBlock';
import {LoadingMark} from './marks';
import {metrics} from './metrics';
import {COMMAND_TEXT, Problem, RETRY_TEXT} from './problem';
import {shared} from './styles';
import {TitleBar} from './TitleBar';
import {WORKING_TEXT} from './working';

export type NeedsProps = {problem: Problem; onClose: () => void};
export type ErrorViewProps = NeedsProps & {
  /** Runs the failed action again; no Retry button without it. */
  onRetry?: () => void;
  /** Returns to the screen the failure came from, as ‹ and the Back key; without it, Back closes (#543). */
  onBack?: () => void;
  /**
   * The bar's title, the tool's or the screen's name, with what failed as a sentence under it;
   * without it, what failed is the bar's title (#543).
   */
  title?: string;
};

/** What a check found missing, why the tool needs it, and the one fix. */
export function Needs({problem, onClose}: NeedsProps): React.JSX.Element {
  return <ProblemView problem={problem} onClose={onClose} testID="needs" />;
}

/** What failed, the reason when known, what to try, Retry when given, and Close. */
export function ErrorView({
  problem,
  onRetry,
  onBack,
  onClose,
  title,
}: ErrorViewProps): React.JSX.Element {
  return (
    <ProblemView
      title={title}
      problem={problem}
      onClose={onClose}
      onRetry={onRetry}
      onBack={onBack}
      testID="error-view"
      alert
    />
  );
}

/**
 * A full view that loads, as the native Plugins list loads (#287): the title bar with the view's
 * title, then the static loading mark and «Loading…» under it, centred on the paper below.
 */
export function LoadingView({title, onClose}: {title?: string; onClose: () => void}): React.JSX.Element {
  useBackKey(onClose);
  return (
    <View style={shared.screen} testID="loading-view">
      <TitleBar title={title ?? ''} onClose={onClose} />
      <View
        style={styles.loading}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={WORKING_TEXT}
        accessibilityLiveRegion="polite">
        <LoadingMark />
        <Text style={shared.title}>{WORKING_TEXT}</Text>
      </View>
    </View>
  );
}

function ProblemView({
  problem,
  onClose,
  onRetry,
  onBack,
  title,
  testID,
  alert = false,
}: ErrorViewProps & {testID: string; alert?: boolean}) {
  // Back does what Close does (#204), unless the failure has a screen to go back to (#543).
  useBackKey(onBack ?? onClose);
  const fix = problem.fix;
  return (
    <View
      style={shared.screen}
      testID={testID}
      accessibilityRole={alert ? 'alert' : undefined}
      accessibilityLiveRegion={alert ? 'assertive' : undefined}>
      <TitleBar title={title ?? problem.what} onBack={onBack} onClose={onClose} />
      {title !== undefined && (
        <Text style={shared.text} testID="problem-what">
          {problem.what}
        </Text>
      )}
      {problem.reason !== undefined && (
        <Text style={shared.hint} testID="problem-reason">
          {problem.reason}
        </Text>
      )}
      {fix !== undefined && 'steps' in fix && (
        <View testID="problem-steps">
          {fix.steps.map((step, index) => (
            <Text key={step} style={shared.text}>
              {`${index + 1}. ${step}`}
            </Text>
          ))}
        </View>
      )}
      {fix !== undefined && 'steps' in fix && fix.command !== undefined && (
        <CodeBlock lines={[fix.command]} label={COMMAND_TEXT} fit />
      )}
      {(fix !== undefined && 'run' in fix) || onRetry ? (
        <View style={shared.buttons}>
          {fix !== undefined && 'run' in fix && (
            <Button label={fix.label} onPress={fix.run} kind="primary" />
          )}
          {onRetry && (
            <Button
              label={RETRY_TEXT}
              onPress={onRetry}
              kind={fix === undefined || !('run' in fix) ? 'primary' : 'secondary'}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {flex: 1, justifyContent: 'center', alignItems: 'center', gap: metrics.loadingMarkGap},
});
