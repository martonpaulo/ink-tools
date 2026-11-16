/**
 * Lookup's language-pair switches for «Insert translation» (#158), moved from the Lingo plugin
 * (#126): one toggle per pair of ink-core's `PAIRS`, the ui-kit Button with `selected` for on.
 * Adding a pair to `PAIRS` adds its switch with no change here.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {LanguageCode, PAIRS} from '@supernote-tools/ink-core';
import {copy} from '../copy';

export type PairsFormProps = {
  pairs: Record<string, boolean>;
  disabled: boolean;
  onChange: (next: Record<string, boolean>) => void;
};

/** A pair's name in words, both languages: «Spanish – Portuguese». */
export const pairLabel = (
  languages: readonly [LanguageCode, LanguageCode],
): string => languages.map(code => copy[`language.${code}`]).join(' – ');

export function PairsForm({
  pairs,
  disabled,
  onChange,
}: PairsFormProps): React.JSX.Element {
  return (
    <View style={shared.listRow}>
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.pairs']}
      </Text>
      <View style={shared.row}>
        {PAIRS.map(pair => {
          const on = pairs[pair.id] === true;
          return (
            <Button
              key={pair.id}
              label={pairLabel(pair.languages)}
              selected={on}
              disabled={disabled}
              onPress={() => onChange({...pairs, [pair.id]: !on})}
            />
          );
        })}
      </View>
    </View>
  );
}
