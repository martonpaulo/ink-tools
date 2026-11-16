/**
 * Bridge's Settings view: the title and the module list, with every size and colour from the
 * shared ui-kit (#93). The opt-in switches come in as `form` (#40); this shell owns the states a
 * Settings screen needs: loading, an error with a retry, no module yet, and each module's status in
 * words, never by colour alone: why it does not run, or its last sync (#88). A module that is off
 * keeps what Bridge wrote; its «Remove what Bridge wrote» button asks once more before anything
 * is deleted (#89).
 */
import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import type {ModuleStatus, SignIn} from '@supernote-tools/sync-core';
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

export type ShellState =
  | {kind: 'loading'}
  | {kind: 'error'; reason: string; onRetry: () => void}
  /** `notice`: a problem that leaves the screen usable, such as a save that failed (#40). */
  | {kind: 'ready'; modules: ModuleRow[]; notice?: string};

export function SettingsShell({
  state,
  form,
}: {
  state: ShellState;
  /** The opt-in switches (#40), drawn under the module list once the settings are ready. */
  form?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <Body state={state} />
      {state.kind === 'ready' && state.notice && (
        <Text accessibilityRole="alert" style={shared.text}>
          {state.notice}
        </Text>
      )}
      {state.kind === 'ready' && form}
    </View>
  );
}

function Body({state}: {state: ShellState}): React.JSX.Element {
  switch (state.kind) {
    case 'loading':
      return <Text style={shared.text}>{copy['settings.loading']}</Text>;
    case 'error':
      return (
        <View style={shared.row}>
          <Text accessibilityRole="alert" style={shared.text}>
            {format('settings.error', {reason: state.reason})}
          </Text>
          <Button label={copy['settings.retry']} onPress={state.onRetry} />
        </View>
      );
    case 'ready':
      if (state.modules.length === 0) {
        return <Text style={shared.text}>{copy['settings.empty']}</Text>;
      }
      return (
        <View>
          {state.modules.map(module => (
            <View key={module.id} style={shared.listRow}>
              <Text style={shared.text}>{module.name}</Text>
              {statusLines(module.status).map((line, index) => (
                <Text key={index} style={shared.hint}>
                  {line}
                </Text>
              ))}
              {module.signIns?.map(provider => (
                <SignInLine key={provider.id} provider={provider} />
              ))}
              {module.status.state === 'off' && module.onRemoveWritten && (
                <Confirmed
                  label={copy['remove.button']}
                  question={format('remove.confirm', {module: module.name})}
                  yes={copy['remove.yes']}
                  onConfirm={module.onRemoveWritten}
                />
              )}
            </View>
          ))}
        </View>
      );
  }
}

/** A provider's sign-in in words: the masked tail and a sign-out, or how to sign in (#90). */
function SignInLine({provider}: {provider: ProviderSignIn}): React.JSX.Element {
  const {signIn} = provider;
  switch (signIn.state) {
    case 'signedOut':
      return (
        <Text style={shared.text}>
          {format('signIn.out', {provider: provider.name, id: provider.id})}
        </Text>
      );
    case 'unreadable':
      return (
        <Text accessibilityRole="alert" style={shared.text}>
          {format('signIn.unreadable', {provider: provider.name, reason: signIn.reason})}
        </Text>
      );
    case 'signedIn':
      return (
        <View>
          <Text style={shared.text}>
            {format('signIn.in', {provider: provider.name, tail: signIn.tail})}
          </Text>
          <Confirmed
            label={copy['signOut.button']}
            accessibilityLabel={format('signOut.label', {provider: provider.name})}
            question={format('signOut.confirm', {provider: provider.name})}
            yes={copy['signOut.yes']}
            onConfirm={provider.onSignOut}
          />
        </View>
      );
  }
}

/** A destructive action: one press asks, the second does it, Cancel does nothing (#89, #90). */
function Confirmed({
  label,
  accessibilityLabel,
  question,
  yes,
  onConfirm,
}: {
  label: string;
  accessibilityLabel?: string;
  question: string;
  yes: string;
  onConfirm: () => void;
}): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        label={label}
        accessibilityLabel={accessibilityLabel}
        onPress={() => setAsking(true)}
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
