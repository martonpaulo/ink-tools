/**
 * Bridge's opt-in switches (#40): one section per module, a toggle for the module and one per
 * provider. A toggle is the ui-kit Button with `selected` for on, as the Supernote system marks
 * the open Settings section (#50); a screen reader hears the on state from `selected`. A provider
 * stays disabled while its module is off, and every change goes through the sync-core rules.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {
  BridgeSettings,
  MODULE_PROVIDERS,
  MODULES,
  setModule,
  setProvider,
} from '@supernote-tools/sync-core/settings';
import {copy} from './copy';

export type SettingsFormProps = {
  settings: BridgeSettings;
  onChange: (next: BridgeSettings) => void;
};

export function SettingsForm({
  settings,
  onChange,
}: SettingsFormProps): React.JSX.Element {
  return (
    <View>
      {MODULES.map(module => {
        const on = settings.modules[module];
        const name = copy[`module.${module}`];
        return (
          <View key={module} style={shared.listRow}>
            <Text accessibilityRole="header" style={shared.heading}>
              {name}
            </Text>
            <View style={shared.row}>
              <Button
                label={name}
                selected={on}
                onPress={() => onChange(setModule(settings, module, !on))}
              />
              {MODULE_PROVIDERS[module].map(provider => (
                <Button
                  key={provider}
                  label={copy[`provider.${provider}`]}
                  selected={settings.providers[provider]}
                  disabled={!on}
                  onPress={() =>
                    onChange(
                      setProvider(
                        settings,
                        provider,
                        !settings.providers[provider],
                      ),
                    )
                  }
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
