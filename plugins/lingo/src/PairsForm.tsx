/**
 * Lingo's language-pair switches (#126): one toggle per pair in ink-core's `PAIRS`, the ui-kit
 * Button with `selected` for on, as Bridge's module switches are (#40). Every change goes through
 * `setPair`, so adding a pair to `PAIRS` adds its switch with no change here.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {
  LanguageCode,
  LingoSettings,
  PAIRS,
  setPair,
} from '@supernote-tools/ink-core';
import {copy} from './copy';

export type PairsFormProps = {
  settings: LingoSettings;
  onChange: (next: LingoSettings) => void;
};

/** A pair's name in words, both languages: «Spanish – Portuguese». */
export const pairLabel = (
  languages: readonly [LanguageCode, LanguageCode],
): string => languages.map(code => copy[`language.${code}`]).join(' – ');

export function PairsForm({
  settings,
  onChange,
}: PairsFormProps): React.JSX.Element {
  return (
    <View style={shared.listRow}>
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.pairs']}
      </Text>
      <View style={shared.row}>
        {PAIRS.map(pair => {
          const on = settings.pairs[pair.id] === true;
          return (
            <Button
              key={pair.id}
              label={pairLabel(pair.languages)}
              selected={on}
              onPress={() => onChange(setPair(settings, pair.id, !on))}
            />
          );
        })}
      </View>
    </View>
  );
}
