/**
 * The «Connect» form of a provider (#487): its fields from `SIGN_IN_FORMS`, typed on the tablet,
 * then «Connect» saves the sign-in in the private plugin folder, where the next sync reads it. A
 * value that is missing or cannot be stored says why under the fields and saves nothing; a save that
 * failed keeps the typed values and says why. The ×, as on every full view, goes back to Settings.
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Button, metrics, shared, TitleBar} from '@ink-tools/ui-kit';
import {copy, format} from './copy';
import type {ProviderSignIn} from './SettingsShell';
import type {SignInForm} from './signInForms';

export function ConnectForm({
  provider,
  form,
  onClose,
}: {
  provider: ProviderSignIn & {onConnect: (secret: string) => Promise<void>};
  form: Extract<SignInForm, {kind: 'typed'}>;
  onClose: () => void;
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const composed = form.compose(values);
    if (!composed.ok) {
      setProblem(copy[composed.problem]);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await provider.onConnect(composed.secret);
      onClose();
    } catch (e) {
      setProblem(format('connect.problem', {provider: provider.name, reason: (e as Error).message}));
      setSaving(false);
    }
  };
  return (
    <View style={shared.screen}>
      <TitleBar title={format('connect.title', {provider: provider.name})} onClose={onClose} />
      <ScrollView style={styles.rows} contentContainerStyle={styles.gap}>
        {form.fields.map(field => (
          <View key={field.key} style={styles.gap}>
            <Text style={shared.heading}>{copy[field.label]}</Text>
            <TextInput
              accessibilityLabel={copy[field.label]}
              value={values[field.key] ?? ''}
              editable={!saving}
              onChangeText={text => {
                setValues(before => ({...before, [field.key]: text}));
                setProblem(null);
              }}
              secureTextEntry={field.secure}
              keyboardType={field.email ? 'email-address' : 'default'}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={metrics.selection}
              style={[shared.outline, shared.text, styles.field]}
            />
          </View>
        ))}
        <Text style={shared.subtitle}>{copy[form.about]}</Text>
        <Text style={shared.subtitle}>{copy['connect.next']}</Text>
        {problem !== null && (
          <Text accessibilityRole="alert" style={shared.text}>
            {problem}
          </Text>
        )}
        <View style={shared.row}>
          <Button
            label={saving ? copy['connect.saving'] : copy['connect.save']}
            accessibilityLabel={format('connect.label', {provider: provider.name})}
            disabled={saving}
            onPress={save}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {flex: 1},
  gap: {gap: metrics.controlGap, paddingVertical: metrics.controlGap},
  field: {
    minHeight: metrics.controlHeight,
    paddingHorizontal: metrics.controlPadding,
    backgroundColor: metrics.paper,
  },
});
