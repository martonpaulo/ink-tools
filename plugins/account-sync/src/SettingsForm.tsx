/**
 * Bridge's opt-in switches (#40): one section per module, a toggle for the module and one per
 * provider. Each is a ui-kit `SwitchRow`, whose switch a screen reader hears as checked or not
 * (#274). A provider
 * stays disabled while its module is off, and every change goes through the sync-core rules.
 */
import React from 'react';
import {View} from 'react-native';
import {SectionCaption, SwitchRow} from '@ink-tools/ui-kit';
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
          <View key={module}>
            <SectionCaption>{name}</SectionCaption>
            <SwitchRow
              title={name}
              value={on}
              onChange={next => onChange(setModule(settings, module, next))}
            />
            {MODULE_PROVIDERS[module].map(provider => (
              <SwitchRow
                key={provider}
                title={copy[`provider.${provider}`]}
                value={settings.providers[provider]}
                disabled={!on}
                onChange={next =>
                  onChange(setProvider(settings, provider, next))
                }
              />
            ))}
            {twoWay(module) && (
              <SwitchRow
                title={copy['sendTabletOnly.button']}
                subtitle={
                  module === 'todo' && on && typeof tabletOnlyTasks === 'number'
                    ? format(
                        settings.sendTabletOnly.todo
                          ? 'sendTabletOnly.sent'
                          : 'sendTabletOnly.kept',
                        {count: String(tabletOnlyTasks)},
                      )
                    : undefined
                }
                value={settings.sendTabletOnly[module]}
                disabled={!on}
                onChange={next =>
                  onChange(setSendTabletOnly(settings, module, next))
                }
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
