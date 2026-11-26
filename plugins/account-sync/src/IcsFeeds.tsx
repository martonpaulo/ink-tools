/**
 * The ICS feeds of the Calendar module (#30): one row per feed, named by its place and host only,
 * since a private feed's address is a secret, each with «Remove»; then a field for a new
 * `https:` or `webcal:` address and «Add feed». A wrong address says why in words and adds
 * nothing; past the limit «Add feed» is disabled and says why. Every change goes through the
 * sync-core rules, which own the address check and the limit.
 */
import React, {useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import {Button, ListRow, metrics, RowGroup, shared} from '@ink-tools/ui-kit';
import {
  addIcsFeed,
  BridgeSettings,
  icsFeedName,
  MAX_ICS_FEEDS,
  removeIcsFeed,
} from '@ink-tools/sync-core/settings';
import {copy, format} from './copy';

export type IcsFeedsProps = {
  settings: BridgeSettings;
  onChange: (next: BridgeSettings) => void;
  /** False while the Calendar module or its ICS provider is off: the rows show, nothing acts. */
  enabled: boolean;
};

export function IcsFeeds({
  settings,
  onChange,
  enabled,
}: IcsFeedsProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const full = settings.icsFeeds.length >= MAX_ICS_FEEDS;
  const add = () => {
    try {
      onChange(addIcsFeed(settings, draft));
      setDraft('');
      setProblem(null);
    } catch {
      setProblem(copy['ics.invalid']);
    }
  };
  // A disabled control says why, in words (interface rule 16, #233).
  const why = !enabled
    ? copy['ics.off']
    : full
    ? format('ics.full', {max: String(MAX_ICS_FEEDS)})
    : undefined;
  return (
    <RowGroup caption={copy['ics.caption']} note={why}>
      {settings.icsFeeds.length === 0 ? (
        <Text style={shared.text}>{copy['ics.empty']}</Text>
      ) : (
        settings.icsFeeds.map((url, index) => {
          const name = icsFeedName(url, index);
          return (
            <ListRow
              key={url}
              title={name}
              trailing={
                <Button
                  label={copy['ics.remove']}
                  accessibilityLabel={format('ics.removeLabel', {name})}
                  disabled={!enabled}
                  onPress={() => onChange(removeIcsFeed(settings, url))}
                />
              }
            />
          );
        })
      )}
      <View key="add" style={styles.add}>
        <View style={shared.row}>
          <TextInput
            accessibilityLabel={copy['ics.field']}
            value={draft}
            editable={enabled && !full}
            onChangeText={text => {
              setDraft(text);
              setProblem(null);
            }}
            onSubmitEditing={add}
            placeholder={copy['ics.field']}
            placeholderTextColor={metrics.placeholder}
            selectionColor={metrics.selection}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            style={[shared.outline, shared.text, styles.field]}
          />
          <Button
            label={copy['ics.add']}
            disabled={!enabled || full || draft.trim() === ''}
            onPress={add}
          />
        </View>
        {problem !== null && (
          <Text accessibilityRole="alert" style={shared.text}>
            {problem}
          </Text>
        )}
      </View>
    </RowGroup>
  );
}

const styles = StyleSheet.create({
  // Clear of the dotted line above and the group's line below, as a row's text is.
  add: {paddingVertical: metrics.controlGap, gap: metrics.controlGap},
  field: {
    flex: 1,
    minHeight: metrics.controlHeight,
    paddingHorizontal: metrics.controlPadding,
    backgroundColor: metrics.paper,
  },
});
