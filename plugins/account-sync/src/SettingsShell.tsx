/**
 * Bridge's Settings view: the title and the module list, with every size and colour from the
 * shared ui-kit (#93). The opt-in switches come in as `form` (#40); this shell owns the states a
 * Settings screen needs: loading, an error with a retry, no module yet, and each module's status in
 * words, never by colour alone: why it does not run, or its last sync (#88). A module that is off
 * keeps what Account Sync wrote; its «Remove what Account Sync wrote» button asks once more before
 * anything is deleted (#89), in the host's own confirm dialog (#273, #296). The title bar carries ui-kit's ×, since Back never reaches the view
 * on the Manta (#204, #266, #274). A settings read that failed is ui-kit's Error state with its
 * reason and Retry, and «Connect» opens the Needs state with the steps that connect the account
 * (#256); each keeps the ×.
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  Button,
  ErrorView,
  ListRow,
  metrics,
  Needs,
  RowGroup,
  shared,
  TitleBar,
} from '@ink-tools/ui-kit';
import type {Problem} from '@ink-tools/ui-kit';
import {confirm, type Result} from '@ink-tools/sn-adapter/official';
import type {ModuleStatus, SignIn} from '@ink-tools/sync-core';
import {copy, format} from './copy';
import {statusLines} from './statusText';

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
  /** The provider's id, as `inkctl secret set <id>` takes it. */
  id: string;
  name: string;
  signIn: SignIn;
  onSignOut: () => void;
};

/** The «Sync now» button (#40): disabled while a pass runs, with why the last pass did not start. */
export type SyncControl = {
  running: boolean;
  onSyncNow: () => void;
  problem?: string;
};

export type ShellState =
  | {kind: 'loading'}
  | {kind: 'error'; reason: string; onRetry: () => void}
  /** `notice`: a problem that leaves the screen usable, such as a save that failed (#40). */
  | {kind: 'ready'; modules: ModuleRow[]; notice?: string; sync?: SyncControl};

/**
 * Asks a destructive question: true for the action, false for Cancel; a failure when the dialog
 * could not be shown. sn-adapter's `confirm`, the host's dialog, unless a test passes its own.
 */
export type Ask = (
  question: string,
  action: string,
  cancel: string,
) => Promise<Result<boolean>>;

export function SettingsShell({
  state,
  form,
  onClose,
  ask = confirm,
}: {
  state: ShellState;
  ask?: Ask;
  /** The opt-in switches (#40), drawn under the module list once the settings are ready. */
  form?: React.ReactNode;
  /** What the title bar's × does: the same as Back (#266). */
  onClose: () => void;
}): React.JSX.Element {
  // The provider whose «Connect» was pressed: its Needs state shows until its × (#256).
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
    return <Needs problem={connectProblem(connecting)} onClose={() => setConnecting(null)} />;
  }
  return (
    <View style={shared.screen}>
      <TitleBar title={copy.title} onClose={onClose} />
      {/* The module rows and one switch row per module and provider outgrow the Manta's height (#274). */}
      <ScrollView style={styles.rows} contentContainerStyle={styles.gap}>
        <Body state={state} onConnect={setConnecting} ask={ask} />
        {state.kind === 'ready' && state.notice && (
          <Text accessibilityRole="alert" style={shared.text}>
            {state.notice}
          </Text>
        )}
        {state.kind === 'ready' && state.sync && <SyncLine sync={state.sync} />}
        {state.kind === 'ready' && form}
      </ScrollView>
    </View>
  );
}

/** What a provider with no connection needs (#256): the Mac step only the owner can do, then a sync. */
export function connectProblem(provider: ProviderSignIn): Problem {
  const names = {provider: provider.name, id: provider.id};
  return {
    what: format('connect.what', names),
    reason: format('connect.why', names),
    fix: {steps: [format('connect.step.mac', names), copy['connect.step.sync']]},
  };
}

type Connect = (provider: ProviderSignIn) => void;

function Body({
  state,
  onConnect,
  ask,
}: {
  state: Exclude<ShellState, {kind: 'error'}>;
  onConnect: Connect;
  ask: Ask;
}): React.JSX.Element {
  switch (state.kind) {
    case 'loading':
      return <Text style={shared.text}>{copy['settings.loading']}</Text>;
    case 'ready':
      if (state.modules.length === 0) {
        return <Text style={shared.text}>{copy['settings.empty']}</Text>;
      }
      // One group of modules: a line only between two modules (#275).
      return (
        <RowGroup>
          {state.modules.map(module => (
            <View key={module.id}>
              {/* The module and its status in words, one kit row (#274); its sign-ins and its
                  remove button follow under it. */}
              <ListRow
                title={module.name}
                subtitle={statusLines(module.status).join('\n') || undefined}
              />
              {module.signIns?.map(provider => (
                <SignInLine key={provider.id} provider={provider} onConnect={onConnect} ask={ask} />
              ))}
              {module.status.state === 'off' && module.onRemoveWritten && (
                <Confirmed
                  label={copy['remove.button']}
                  question={format('remove.confirm', {module: module.name})}
                  yes={copy['remove.yes']}
                  onConfirm={module.onRemoveWritten}
                  ask={ask}
                />
              )}
            </View>
          ))}
        </RowGroup>
      );
  }
}

/** «Sync now», and in words that a pass runs or why the last one did not start. */
function SyncLine({sync}: {sync: SyncControl}): React.JSX.Element {
  return (
    <View style={shared.row}>
      <Button
        label={copy['sync.button']}
        disabled={sync.running}
        onPress={sync.onSyncNow}
      />
      {sync.running && <Text style={shared.hint}>{copy['sync.running']}</Text>}
      {!sync.running && sync.problem && (
        <Text accessibilityRole="alert" style={shared.text}>
          {format('sync.problem', {reason: sync.problem})}
        </Text>
      )}
    </View>
  );
}

/** A provider's sign-in in words: the masked tail and a sign-out, or how to sign in (#90). */
function SignInLine({
  provider,
  onConnect,
  ask,
}: {
  provider: ProviderSignIn;
  onConnect: Connect;
  ask: Ask;
}): React.JSX.Element {
  // Its own gap and a space before the next module's divider, so the line, its button and the
  // divider never touch (#116).
  return <View style={styles.signIn}>{signInParts(provider, onConnect, ask)}</View>;
}

function signInParts(
  provider: ProviderSignIn,
  onConnect: Connect,
  ask: Ask,
): React.JSX.Element {
  const {signIn} = provider;
  switch (signIn.state) {
    case 'signedOut':
      return <ConnectLine provider={provider} onConnect={onConnect} />;
    case 'unreadable':
      return (
        <Text accessibilityRole="alert" style={shared.text}>
          {format('signIn.unreadable', {
            provider: provider.name,
            reason: signIn.reason,
          })}
        </Text>
      );
    case 'signedIn':
      return (
        <>
          <Text style={shared.text}>
            {format('signIn.in', {provider: provider.name, tail: signIn.tail})}
          </Text>
          <Confirmed
            label={copy['signOut.button']}
            accessibilityLabel={format('signOut.label', {
              provider: provider.name,
            })}
            question={format('signOut.confirm', {provider: provider.name})}
            yes={copy['signOut.yes']}
            onConfirm={provider.onSignOut}
            ask={ask}
          />
        </>
      );
  }
}

/**
 * A provider with no connection (owner, 2026-11-26, docs/plugin-scope.md › Rules for every
 * feature): it says so and offers «Connect», which opens the Needs state (#256); the rest of the
 * plugin runs as usual.
 * shortcut: the tablet cannot sign in yet, so the Needs state gives the Mac command; the in-app
 * sign-in of each provider (#28 for Google) replaces it.
 */
function ConnectLine({
  provider,
  onConnect,
}: {
  provider: ProviderSignIn;
  onConnect: Connect;
}): React.JSX.Element {
  return (
    <>
      <Text style={shared.text}>{format('signIn.out', {provider: provider.name})}</Text>
      <Button
        label={format('connect.label', {provider: provider.name})}
        onPress={() => onConnect(provider)}
      />
    </>
  );
}

/**
 * A destructive action: one press asks in the host's confirm dialog, and only its action does it;
 * Cancel and Back do nothing (#89, #90, #296). When the dialog cannot be shown, the question is
 * drawn here instead, with its own Cancel, so the action is never done unasked nor lost.
 */
function Confirmed({
  label,
  accessibilityLabel,
  question,
  yes,
  onConfirm,
  ask,
}: {
  label: string;
  accessibilityLabel?: string;
  question: string;
  yes: string;
  onConfirm: () => void;
  ask: Ask;
}): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const press = async () => {
    setWaiting(true);
    const answer = await ask(question, yes, copy.cancel);
    setWaiting(false);
    if (!answer.ok) {
      console.log(`[Bridge] confirm: the dialog failed: ${answer.code} ${answer.message}; asked in the view`);
      setAsking(true);
    } else if (answer.value) {
      onConfirm();
    }
  };
  if (!asking) {
    return (
      <Button
        label={label}
        accessibilityLabel={accessibilityLabel}
        disabled={waiting}
        onPress={() => {
          press();
        }}
      />
    );
  }
  return (
    <View>
      <Text accessibilityRole="alert" style={shared.text}>
        {question}
      </Text>
      <View style={shared.row}>
        <Button label={copy.cancel} onPress={() => setAsking(false)} />
        <Button
          label={yes}
          onPress={() => {
            setAsking(false);
            onConfirm();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
  /** The screen's own gap between its parts, kept inside the scroll. */
  gap: {gap: metrics.sectionGap},
  signIn: {gap: metrics.controlGap, paddingBottom: metrics.sectionGap},
});
