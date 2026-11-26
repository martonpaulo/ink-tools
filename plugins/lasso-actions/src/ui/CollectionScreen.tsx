/**
 * The collection's view (#249), opened by «Paste Collection»: how many pieces it holds, «Paste
 * Collection» (the one primary action), «Clear Collection», and the «Keep After Paste» switch,
 * saved with the other settings. Paste closes this screen and runs under the «Loading…» strip as
 * every no-view press does (#103); Clear stays here and shows the new count. The title bar's ×
 * closes the view, since Back never reaches it on the Manta (#204, #266).
 */
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {
  Button,
  shared,
  SwitchGroup,
  TitleBar,
  useBackKey,
} from '@ink-tools/ui-kit';
import {copy} from '../copy';
import {
  clearCollection,
  countPieces,
  DEVICE_HOST,
  pasteCollection,
  type CollectionHost,
} from '../collection/run';
import {closeCollection} from '../collection/view';
import {getSettings, saveSettings} from '../profile';
import type {LassoSettings} from '../settings';
import {working} from '../working';

export function CollectionScreen({
  close,
  host = DEVICE_HOST,
}: {
  /** Closes the plugin view. */
  close: () => void;
  /** The tablet's calls; tests pass a fake page. */
  host?: CollectionHost;
}) {
  const [count, setCount] = useState<number | null | undefined>(undefined);
  const [settings, setSettings] = useState<LassoSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const leave = () => {
    closeCollection();
    close();
  };
  useBackKey(leave);
  useEffect(() => {
    let open = true;
    countPieces(host).then(found => open && setCount(found));
    getSettings().then(saved => open && setSettings(saved));
    return () => {
      open = false;
    };
  }, [host]);
  const keep = settings?.collection.keepAfterPaste ?? false;
  const empty = count === 0 || count === null || count === undefined;
  const paste = () => {
    closeCollection();
    working
      .run(() => pasteCollection(host, keep))
      .catch(error => console.error(`Lookup: paste: ${error.message}`));
  };
  const clear = async () => {
    setBusy(true);
    await clearCollection(host);
    setCount(await countPieces(host));
    setBusy(false);
  };
  return (
    <View style={shared.screen}>
      <TitleBar
        title={copy['collection.title']}
        onClose={busy ? undefined : leave}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[shared.text, shared.statusLine]}>
        {count === undefined ? '' : copy['collection.count'](count)}
      </Text>
      <View style={shared.buttons}>
        <Button
          label={copy['button.collectionPaste']}
          kind="primary"
          disabled={busy || empty}
          onPress={paste}
        />
        <Button
          label={copy['button.collectionClear']}
          disabled={busy || empty}
          onPress={clear}
        />
      </View>
      <SwitchGroup
        title={copy['collection.keep']}
        subtitle={copy['collection.keepHint']}
        value={keep}
        disabled={settings === null}
        onChange={on => {
          if (settings) {
            const next = {...settings, collection: {keepAfterPaste: on}};
            setSettings(next);
            saveSettings(next);
          }
        }}
      />
    </View>
  );
}
