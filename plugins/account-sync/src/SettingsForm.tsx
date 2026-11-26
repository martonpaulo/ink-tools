/**
 * Bridge's modules as native Settings draws a page (#40, #411): one `RowGroup` per module under its
 * caption. The module's switch carries its status in one line (`statusLine`); each provider's switch
 * is followed by its account row, the sign-in and its «Sign out» or «Connect» at the row's trailing
 * edge; «Send tablet-only items» says once how many items it concerns; a module that is off offers
 * «Remove what Account Sync wrote» as a row action, asked once more (#89). Every control is a ui-kit
 * row, whose switch a screen reader hears as checked or not (#274). A destructive action asks in
 * the host's own confirm dialog (#273, #296). The Calendar module's ICS feed
 * addresses follow its group (#30). A provider stays disabled while its module is off, and every
 * change goes through the sync-core rules.
 */
import React, {useState} from 'react';
import {View} from 'react-native';
import {ActionRow, RowGroup, SwitchRow} from '@ink-tools/ui-kit';
import {
  BridgeSettings,
  MODULE_PROVIDERS,
  MODULES,
  ModuleId,
  ProviderId,
  READ_ONLY_PROVIDERS,
  setModule,
  setProvider,
  setSendTabletOnly,
  TWO_WAY_MODULES,
  TwoWayModule,
} from '@ink-tools/sync-core/settings';
import {copy, format, joinNames, plural} from './copy';
import {IcsFeeds} from './IcsFeeds';
import {confirm} from '@ink-tools/sn-adapter/official';
import type {Ask, Connect, ModuleRow, ProviderSignIn} from './SettingsShell';
import {statusLine} from './statusText';

const twoWay = (m: string): m is TwoWayModule =>
  (TWO_WAY_MODULES as string[]).includes(m);

const providerNames = (module: ModuleId) =>
  joinNames(MODULE_PROVIDERS[module].map(p => copy[`provider.${p}`]));

/** The providers a tablet-only item can be sent to: never a read-only one, such as ICS. */
const sendTargets = (module: ModuleId) =>
  joinNames(
    MODULE_PROVIDERS[module]
      .filter(p => !READ_ONLY_PROVIDERS.includes(p))
      .map(p => copy[`provider.${p}`]),
  );

const ITEMS: Record<TwoWayModule, 'item.task' | 'item.event'> = {
  todo: 'item.task',
  calendar: 'item.event',
};

const ITEM_NOUNS: Record<TwoWayModule, 'items.task' | 'items.event'> = {
  todo: 'items.task',
  calendar: 'items.event',
};

export type SettingsFormProps = {
  settings: BridgeSettings;
  onChange: (next: BridgeSettings) => void;
  /** Each module's status, sign-ins and remove action, by id (`moduleRows`). */
  modules?: ModuleRow[];
  /** Opens the Needs state of a provider with no connection (#256). */
  onConnect?: Connect;
  /** The time the statuses compare with, so «today» shows only the time; tests pass one. */
  now?: number;
  /** The confirm dialog of a destructive action: the host's, unless a test passes its own. */
  ask?: Ask;
};

export function SettingsForm({
  settings,
  onChange,
  modules = [],
  onConnect = () => {},
  now,
  ask = confirm,
}: SettingsFormProps): React.JSX.Element {
  return (
    <View>
      {MODULES.map(module => {
        const on = settings.modules[module];
        const name = copy[`module.${module}`];
        const row = modules.find(m => m.id === module);
        const signIns = row?.signIns ?? [];
        return (
          <React.Fragment key={module}>
            <RowGroup caption={name}>
              <SwitchRow
                title={format('module.switch', {module: name})}
                subtitle={
                  row
                    ? statusLine(
                        row.status,
                        format(`about.${module}`, {providers: providerNames(module)}),
                        now,
                      )
                    : undefined
                }
                value={on}
                onChange={next => onChange(setModule(settings, module, next))}
              />
              {MODULE_PROVIDERS[module].flatMap(provider => {
                const signIn = signIns.find(s => s.id === provider);
                return [
                  <SwitchRow
                    key={provider}
                    title={copy[`provider.${provider}`]}
                    value={settings.providers[provider]}
                    disabled={!on}
                    onChange={next =>
                      onChange(setProvider(settings, provider as ProviderId, next))
                    }
                  />,
                  signIn && (
                    <AccountRow
                      key={`${provider}-account`}
                      provider={signIn}
                      onConnect={onConnect}
                      ask={ask}
                    />
                  ),
                ];
              })}
              {twoWay(module) && (
                <SwitchRow
                  title={copy['sendTabletOnly.button']}
                  subtitle={tabletOnlyNotice(module, settings, row)}
                  value={settings.sendTabletOnly[module]}
                  disabled={!on}
                  onChange={next =>
                    onChange(setSendTabletOnly(settings, module, next))
                  }
                />
              )}
              {!on && row?.onRemoveWritten && (
                <RemoveRow module={name} onConfirm={row.onRemoveWritten} ask={ask} />
              )}
            </RowGroup>
            {module === 'calendar' && (
              <IcsFeeds
                settings={settings}
                onChange={onChange}
                enabled={on && settings.providers.ics}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/**
 * The tablet-only notice, said once, at its own setting (#411): how many items exist only on the
 * tablet and what the switch does with them, from the module's last run; before a run, or with
 * none left, what the switch sends and to where. Only a pass counts: the tablet alone cannot tell a
 * task the service already holds, so a count read before it was too high (device round 6).
 */
export function tabletOnlyNotice(
  module: TwoWayModule,
  settings: BridgeSettings,
  row?: ModuleRow,
): string | undefined {
  if (!settings.modules[module]) {
    return undefined;
  }
  const run = row?.status.state === 'ran' ? row.status.run : undefined;
  const count = run?.keptLocal;
  const providers = sendTargets(module);
  if (!count) {
    return format(settings.sendTabletOnly[module] ? 'sendTabletOnly.aboutOn' : 'sendTabletOnly.about', {
      items: copy[ITEM_NOUNS[module]],
      providers,
    });
  }
  const values = {
    items: plural(ITEMS[module], count),
    providers,
  };
  return settings.sendTabletOnly[module]
    ? plural('sendTabletOnly.sent', count, values)
    : plural('sendTabletOnly.kept', count, values);
}

/** A provider's account as one row (#411): its sign-in in words, «Sign out» or «Connect» at its end. */
function AccountRow({
  provider,
  onConnect,
  ask,
}: {
  provider: ProviderSignIn;
  onConnect: Connect;
  ask: Ask;
}): React.JSX.Element {
  const title = format('account.title', {provider: provider.name});
  const {signIn} = provider;
  switch (signIn.state) {
    case 'signedOut':
      return (
        <ActionRow
          title={title}
          subtitle={copy['signIn.out']}
          action={{
            label: copy['connect.button'],
            accessibilityLabel: format('connect.label', {provider: provider.name}),
            onPress: () => onConnect(provider),
          }}
        />
      );
    case 'unreadable':
      // Sign out deletes the sign-in file here too, so it asks first, as when signed in (#296).
      return (
        <Confirmed
          title={title}
          subtitle={format('signIn.unreadable', {reason: signIn.reason})}
          label={copy['signOut.button']}
          accessibilityLabel={format('signOut.label', {provider: provider.name})}
          question={format('signOut.confirm', {provider: provider.name})}
          yes={copy['signOut.yes']}
          onConfirm={provider.onSignOut}
          ask={ask}
        />
      );
    case 'signedIn':
      return (
        <Confirmed
          title={title}
          subtitle={format('signIn.in', {tail: signIn.tail})}
          label={copy['signOut.button']}
          accessibilityLabel={format('signOut.label', {provider: provider.name})}
          question={format('signOut.confirm', {provider: provider.name})}
          yes={copy['signOut.yes']}
          onConfirm={provider.onSignOut}
          ask={ask}
        />
      );
  }
}

/** «Remove what Account Sync wrote», offered while a module is off (#89). */
function RemoveRow({
  module,
  onConfirm,
  ask,
}: {
  module: string;
  onConfirm: () => void;
  ask: Ask;
}): React.JSX.Element {
  return (
    <Confirmed
      title={copy['remove.title']}
      subtitle={copy['remove.about']}
      label={copy['remove.yes']}
      question={format('remove.confirm', {module})}
      yes={copy['remove.yes']}
      onConfirm={onConfirm}
      ask={ask}
    />
  );
}

/**
 * A destructive row action (#89, #90, #296): one press asks in the host's confirm dialog, and only
 * its action does it; Cancel and Back do nothing. The row keeps no «asking» state of its own while
 * the dialog shows: Back gives no answer, and sn-adapter's `confirm` settles that question as a
 * Cancel at the next press, so the row stays pressable (#296). When the dialog cannot be shown, the
 * row asks itself, with Cancel beside the action, so the action is never done unasked nor lost.
 */
function Confirmed({
  title,
  subtitle,
  label,
  accessibilityLabel,
  question,
  yes,
  onConfirm,
  ask,
}: {
  title: string;
  subtitle: string;
  label: string;
  accessibilityLabel?: string;
  question: string;
  yes: string;
  onConfirm: () => void;
  ask: Ask;
}): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  const press = async () => {
    const answer = await ask(question, yes, copy.cancel);
    if (!answer.ok) {
      console.log(`[Bridge] confirm: the dialog failed: ${answer.code} ${answer.message}; asked in the view`);
      setAsking(true);
    } else if (answer.value) {
      onConfirm();
    }
  };
  if (!asking) {
    return (
      <ActionRow
        title={title}
        subtitle={subtitle}
        action={{
          label,
          accessibilityLabel,
          onPress: () => {
            press();
          },
        }}
      />
    );
  }
  return (
    <ActionRow
      title={title}
      subtitle={question}
      secondAction={{label: copy.cancel, onPress: () => setAsking(false)}}
      action={{
        label: yes,
        onPress: () => {
          setAsking(false);
          onConfirm();
        },
      }}
    />
  );
}
