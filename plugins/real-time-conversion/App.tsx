import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {Button, shared} from '@supernote-tools/ui-kit';
import {copy} from './src/copy';
import {getSettings, setSettings, Settings, Spacing, Wait} from './src/settings';

type Choice<V> = {value: V; label: string};

const START: Choice<boolean>[] = [
  {value: true, label: copy['value.on']},
  {value: false, label: copy['value.off']},
];
const SPACINGS: Choice<Spacing>[] = [
  {value: 'tight', label: copy['value.tight']},
  {value: 'normal', label: copy['value.normal']},
  {value: 'wide', label: copy['value.wide']},
];
const WAITS: Choice<Wait>[] = [
  {value: 'short', label: copy['value.short']},
  {value: 'normal', label: copy['value.normal']},
  {value: 'long', label: copy['value.long']},
];

/** One setting: its name and a row of value buttons, the current one selected (Ink2Pic's look). */
function Row<V>({
  title,
  choices,
  value,
  onChange,
}: {
  title: string;
  choices: Choice<V>[];
  value: V;
  onChange: (next: V) => void;
}) {
  return (
    <View>
      <Text accessibilityRole="header" style={shared.heading}>
        {title}
      </Text>
      <View style={shared.row}>
        {choices.map(choice => (
          <Button
            key={choice.label}
            label={choice.label}
            accessibilityLabel={`${title}: ${choice.label}`}
            selected={choice.value === value}
            onPress={() => onChange(choice.value)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Real-Time Conversion's Settings view (#184), every size and colour from the shared ui-kit (#93):
 * the switch's start state and the word rule's two measures (#185). The word rule reads them the
 * next time Real-Time Text turns on.
 */
export default function App() {
  const [settings, setLocal] = useState<Settings>(getSettings);
  const change = (next: Settings) => {
    setSettings(next);
    setLocal(next);
  };
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        {copy.title}
      </Text>
      <Row
        title={copy['settings.start']}
        choices={START}
        value={settings.startOn}
        onChange={startOn => change({...settings, startOn})}
      />
      <Row
        title={copy['settings.spacing']}
        choices={SPACINGS}
        value={settings.spacing}
        onChange={spacing => change({...settings, spacing})}
      />
      <Row
        title={copy['settings.wait']}
        choices={WAITS}
        value={settings.wait}
        onChange={wait => change({...settings, wait})}
      />
      <Text accessibilityRole="header" style={shared.heading}>
        {copy['settings.font']}
      </Text>
      <Text style={shared.text}>{copy['settings.fontNote']}</Text>
    </View>
  );
}
