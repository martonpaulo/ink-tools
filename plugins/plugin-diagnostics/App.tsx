import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {
  Button,
  CodeBlock,
  ErrorView,
  LoadingView,
  Needs,
  shared,
  TitleBar,
  useBackKey,
} from '@ink-tools/ui-kit';
import {copy} from './src/copy';
import {probe, type ProbeOutcome} from './src/probe';

type Phase = {phase: 'idle'} | {phase: 'running'} | {phase: 'ended'; outcome: ProbeOutcome};

const closeView = () => {
  PluginManager.closePluginView().catch((error: Error) => {
    console.error(`Probe: ${error.message}`);
  });
};

/**
 * Runs the probe when «Run Probe» is pressed and shows its log lines; the same lines go to logcat.
 * Not on mount: the host mounts this component at the first press of «Run Command» too, even with
 * no view (docs/supernote.md › Plugins), and that press must not run the probe (#148).
 * Every screen is ui-kit's (#257): the title bar's × closes the plugin view (`closePluginView`), so
 * the probe can run again in a fresh view without a reboot, needed to test the background
 * lifecycle (#39); a probe that found something missing shows the Needs state with its fix, and
 * one that failed the Error state with its reason and Retry.
 */
export default function App({
  close = closeView,
  run = () => probe(PluginManager as unknown as Record<string, unknown>),
}: {
  /** Closes the plugin view; tests pass a fake. */
  close?: () => void;
  /** Runs the probe; tests pass a fake. */
  run?: () => Promise<ProbeOutcome>;
}) {
  const [state, setState] = useState<Phase>({phase: 'idle'});
  useBackKey(close);
  const start = () => {
    setState({phase: 'running'});
    run().then(outcome => setState({phase: 'ended', outcome}));
  };
  if (state.phase === 'running') {
    return <LoadingView title={copy.title} onClose={close} />;
  }
  if (state.phase === 'ended' && state.outcome.status === 'needs') {
    const need = state.outcome.need;
    return (
      <Needs
        problem={{what: need.what, reason: need.reason, fix: {steps: [...need.steps], command: need.command}}}
        onClose={close}
      />
    );
  }
  if (state.phase === 'ended' && state.outcome.status === 'failed') {
    return (
      <ErrorView
        problem={{what: copy.failed, reason: state.outcome.reason}}
        onRetry={start}
        onClose={close}
      />
    );
  }
  // The block shows the output of a run that ended; before any run there is nothing to frame.
  const lines = state.phase === 'ended' ? state.outcome.lines : null;
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={close} />
      <Text style={shared.hint}>{copy.hint}</Text>
      <View style={shared.buttons}>
        <Button label={copy.run} onPress={start} primary />
      </View>
      {lines !== null && lines.length > 0 && <CodeBlock lines={lines} label={copy.output} />}
      {lines !== null && lines.length === 0 && <Text style={shared.hint}>{copy.noLines}</Text>}
    </View>
  );
}
