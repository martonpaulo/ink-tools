/**
 * The full-view states a tool shows when it cannot go on, or waits (#245, #255): `Needs` after a
 * check, `ErrorView` after a failure, `LoadingView` while a full view loads. Each is one column
 * under the title row with its Close, and stays until the owner closes it. Static text only: each
 * frame of an animation costs an e-ink refresh.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {useBackKey} from './backKey';
import {Button} from './Button';
import {TitleRow} from './CloseButton';
import {Problem, RETRY_TEXT} from './problem';
import {shared} from './styles';
import {WORKING_TEXT} from './working';

export type NeedsProps = {problem: Problem; onClose: () => void};
export type ErrorViewProps = NeedsProps & {
  /** Runs the failed action again; no Retry button without it. */
  onRetry?: () => void;
};

/** What a check found missing, why the tool needs it, and the one fix. */
export function Needs({problem, onClose}: NeedsProps): React.JSX.Element {
  return <ProblemView problem={problem} onClose={onClose} testID="needs" />;
}

/** What failed, the reason when known, what to try, Retry when given, and Close. */
export function ErrorView({
  problem,
  onRetry,
  onClose,
}: ErrorViewProps): React.JSX.Element {
  return (
    <ProblemView
      problem={problem}
      onClose={onClose}
      onRetry={onRetry}
      testID="error-view"
      alert
    />
  );
}

/** A full view that loads, in the strip's words. */
export function LoadingView({onClose}: {onClose: () => void}): React.JSX.Element {
  useBackKey(onClose);
  return (
    <View style={shared.screen} testID="loading-view">
      <TitleRow title={WORKING_TEXT} onClose={onClose} />
    </View>
  );
}

function ProblemView({
  problem,
  onClose,
  onRetry,
  testID,
  alert = false,
}: ErrorViewProps & {testID: string; alert?: boolean}) {
  // Back does what Close does (#204).
  useBackKey(onClose);
  const fix = problem.fix;
  return (
    <View
      style={shared.screen}
      testID={testID}
      accessibilityRole={alert ? 'alert' : undefined}
      accessibilityLiveRegion={alert ? 'assertive' : undefined}>
      <TitleRow title={problem.what} onClose={onClose} />
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
      {(fix !== undefined && 'run' in fix) || onRetry ? (
        <View style={shared.buttons}>
          {fix !== undefined && 'run' in fix && (
            <Button label={fix.label} onPress={fix.run} primary />
          )}
          {onRetry && (
            <Button
              label={RETRY_TEXT}
              onPress={onRetry}
              primary={fix === undefined || !('run' in fix)}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
