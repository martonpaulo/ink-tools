/**
 * Bridge's Settings view: the title bar and the states a Settings screen needs, with every size and
 * colour from the shared ui-kit (#93): loading, an error with a retry, and the modules, which `SettingsForm` draws as one group each (#411). The title bar carries ui-kit's ×,
 * since Back never reaches the view on the Manta (#204, #266, #274), and the screen's one action,
 * «Sync now», at its trailing edge, as the native title bar puts a screen's action (#411). A
 * settings read that failed is ui-kit's Error state with its reason and Retry, and «Connect» opens
 * the provider's form, typed on the tablet (#487), or, for a provider that cannot connect on the
 * tablet yet, the Needs state that says why (#256); each keeps the ×.
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {ErrorView, metrics, Needs, shared, TitleBar} from '@ink-tools/ui-kit';
import type {Problem} from '@ink-tools/ui-kit';
import type {Result} from '@ink-tools/sn-adapter/official';
import type {ModuleStatus, SignIn} from '@ink-tools/sync-core';
import type {SecretProvider} from '@ink-tools/sync-core/secrets';
import {copy, format} from './copy';
import {ConnectForm} from './ConnectForm';
import {SIGN_IN_FORMS} from './signInForms';

export type ModuleRow = {
  id: string;
  name: string;
  /** Off, blocked by the device probe with its reasons (#67), waiting, or its last run (#88). */
  status: ModuleStatus;
  /** Removes the rows Bridge wrote for this module; offered only while the module is off (#89). */
  onRemoveWritten?: () => void;
  /** The sign-in of each provider of the module that needs a secret (#90). */
  signIns?: ProviderSignIn[];
};

export type ProviderSignIn = {
  /** The provider's id, the name of its secret file. */
  id: SecretProvider;
  name: string;
  signIn: SignIn;
  onSignOut: () => void;
  /** Saves the sign-in typed in its «Connect» form (#487); throws with the reason when it fails. */
  onConnect?: (secret: string) => Promise<void>;
};

/** «Sync now» (#40): «Syncing…» while a pass runs, with why the last pass did not start. */
export type SyncControl = {
  running: boolean;
  onSyncNow: () => void;
  problem?: string;
};

export type ShellState =
  | {kind: 'loading'}
  | {kind: 'error'; reason: string; onRetry: () => void}
  /** `notice`: a problem that leaves the screen usable, such as a save that failed (#40). */
  | {kind: 'ready'; notice?: string; sync?: SyncControl};

/**
 * Asks a destructive question: true for the action, false for Cancel; a failure when the dialog
 * could not be shown. sn-adapter's `confirm`, the host's dialog, unless a test passes its own (#296).
 */
export type Ask = (
  question: string,
  action: string,
  cancel: string,
) => Promise<Result<boolean>>;

/** The provider whose «Connect» was pressed, set by the form; its Needs state shows until its ×. */
export type Connect = (provider: ProviderSignIn) => void;

export function SettingsShell({
  state,
  renderForm,
  onClose,
}: {
  state: ShellState;
  /** The modules (#40, #411), drawn once the settings are ready; it gets the «Connect» handler. */
  renderForm?: (onConnect: Connect) => React.ReactNode;
  /** What the title bar's × does: the same as Back (#266). */
  onClose: () => void;
}): React.JSX.Element {
  const [connecting, setConnecting] = useState<ProviderSignIn | null>(null);
  if (state.kind === 'error') {
    return (
      <ErrorView
        problem={{what: copy['settings.error'], reason: state.reason}}
        onRetry={state.onRetry}
        onClose={onClose}
      />
    );
  }
  if (connecting !== null) {
    const form = SIGN_IN_FORMS[connecting.id];
    const onConnect = connecting.onConnect;
    if (form?.kind === 'typed' && onConnect) {
      return (
        <ConnectForm
          provider={{...connecting, onConnect}}
          form={form}
          onClose={() => setConnecting(null)}
        />
      );
    }
    return <Needs problem={connectProblem(connecting)} onClose={() => setConnecting(null)} />;
  }
  const sync = state.kind === 'ready' ? state.sync : undefined;
  return (
    <View style={shared.screen}>
      <TitleBar
        title={copy.title}
        onClose={onClose}
        action={
          sync &&
          (sync.running
            ? {label: copy['sync.running']}
            : {label: copy['sync.button'], onPress: sync.onSyncNow})
        }
      />
      {/* One group per module outgrows the Manta's height (#274). */}
      <ScrollView style={styles.rows} contentContainerStyle={styles.gap}>
        {state.kind === 'loading' && <Text style={shared.text}>{copy['settings.loading']}</Text>}
        {state.kind === 'ready' && state.notice && (
          <Text accessibilityRole="alert" style={shared.text}>
            {state.notice}
          </Text>
        )}
        {sync && !sync.running && sync.problem && (
          <Text accessibilityRole="alert" style={shared.text}>
            {format('sync.problem', {reason: sync.problem})}
          </Text>
        )}
        {state.kind === 'ready' && renderForm?.(setConnecting)}
      </ScrollView>
    </View>
  );
}

/** A provider that cannot connect on the tablet yet (#256, #487): what is missing and why, no step. */
export function connectProblem(provider: ProviderSignIn): Problem {
  const form = SIGN_IN_FORMS[provider.id];
  return {
    what: format('connect.what', {provider: provider.name}),
    reason: form?.kind === 'unavailable' ? copy[form.reason] : undefined,
  };
}

const styles = StyleSheet.create({
  rows: {flex: 1},
  /** The screen's own gap between its parts, kept inside the scroll. */
  gap: {gap: metrics.sectionGap},
});
