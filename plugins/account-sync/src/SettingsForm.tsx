/**
 * Bridge's opt-in switches (#40): one section per module, a toggle for the module and one per
 * provider. A toggle is the ui-kit Button with `selected` for on, as the Supernote system marks
 * the open Settings section (#50); a screen reader hears the on state from `selected`. A provider
 * stays disabled while its module is off, and every change goes through the sync-core rules.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@ink-tools/ui-kit';
import {
  BridgeSettings,
  MODULE_PROVIDERS,
  MODULES,
  setModule,
  setProvider,
  setSendTabletOnly,
  TWO_WAY_MODULES,
  TwoWayModule,
} from '@ink-tools/sync-core/settings';
import {copy, format} from './copy';

const twoWay = (m: string): m is TwoWayModule =>
  (TWO_WAY_MODULES as string[]).includes(m);

export type SettingsFormProps = {
  settings: BridgeSettings;
  onChange: (next: BridgeSettings) => void;
  /** Open, unlinked tablet To-Do tasks, read before the first sync; absent while unknown. */
  tabletOnlyTasks?: number | null;
};

export function SettingsForm({
  settings,
  onChange,
  tabletOnlyTasks,
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
            <View style={shared.buttons}>
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
              {twoWay(module) && (
                <Button
                  label={copy['sendTabletOnly.button']}
                  selected={settings.sendTabletOnly[module]}
                  disabled={!on}
                  onPress={() =>
                    onChange(
                      setSendTabletOnly(
                        settings,
                        module,
                        !settings.sendTabletOnly[module],
                      ),
                    )
                  }
                />
              )}
            </View>
            {module === 'todo' && on && typeof tabletOnlyTasks === 'number' && (
              <Text style={shared.hint}>
                {format(
                  settings.sendTabletOnly.todo
                    ? 'sendTabletOnly.sent'
                    : 'sendTabletOnly.kept',
                  {count: String(tabletOnlyTasks)},
                )}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
