/**
 * The setting shapes every Settings page repeats, built from the native controls (#274), so a
 * plugin draws none by hand: a group of rows under its caption, an on/off setting as one `ListRow`
 * with a trailing `Switch`, and one value out of several as a group with one `ListRow` per value,
 * each with its `Radio`.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button} from './Button';
import {ListRow} from './ListRow';
import {metrics} from './metrics';
import {shared} from './styles';
import {SectionCaption} from './marks';
import {Radio} from './Radio';
import {Switch} from './Switch';

export type RowGroupProps = {
  /** The group's name, the caption over its rows. */
  caption?: string;
  /** The rows; `false`, `null` and `undefined` are left out, so a row can be conditional. */
  children?: React.ReactNode;
  /** What explains the group, right under its last row: one paragraph each. */
  note?: string | readonly string[];
};

/**
 * Rows that belong together, as the native screens group them (owner, #275; #272): the caption at
 * the bottom of its box, then its rows with the light dotted line between two of them, and the
 * solid line after the last, as the native Page menu and Settings › Apps › Plugins draw them. A note
 * sits under the last row, above the solid line, as the native note of «Usage and Diagnostics». The
 * caption's box is the space above a group: it takes back the section gap its container puts above
 * it, and the group adds that gap under its solid line, so a first caption starts at the title bar's
 * bottom and plain text after a group keeps a gap (owner D91 A, #416).
 */
export function RowGroup({caption, children, note}: RowGroupProps): React.JSX.Element {
  const rows = React.Children.toArray(children);
  const notes = note === undefined ? [] : typeof note === 'string' ? [note] : note;
  return (
    <View style={styles.group}>
      {caption !== undefined && <SectionCaption>{caption}</SectionCaption>}
      {rows.map((row, index) => (
        <React.Fragment key={React.isValidElement(row) && row.key !== null ? row.key : index}>
          {index > 0 && <LightLine />}
          {row}
        </React.Fragment>
      ))}
      {notes.map(paragraph => (
        <Text key={paragraph} style={[shared.subtitle, styles.note]}>
          {paragraph}
        </Text>
      ))}
      <View testID="group-line" style={styles.separator} />
    </View>
  );
}

/**
 * The light dotted line: the top edge of a dashed box cut to the line's height, since React Native
 * dashes a border only when all four sides are drawn. shortcut: React Native draws 3 on, 3 off at
 * 1 px where the native line is 3 on, 4 off (`lightDash`, `lightGap`); Ink.java draws the native
 * pattern. Upgrade with a drawn line if the owner sees the difference.
 */
function LightLine(): React.JSX.Element {
  return (
    <View testID="row-light-line" style={styles.lightBox}>
      <View style={styles.lightDashes} />
    </View>
  );
}

export type SwitchRowProps = {
  title: string;
  /** A hint or the current state in words, under the title. */
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * An on/off setting: a press anywhere on its row turns it, its title too, not only the switch at
 * its end, as a choice row chooses (#554); the row speaks as the switch, by its title.
 */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: SwitchRowProps): React.JSX.Element {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      onPress={() => onChange(!value)}
      control={{role: 'switch', label: title, checked: value, disabled}}
      trailing={<Switch value={value} disabled={disabled} />}
    />
  );
}

/**
 * An on/off setting with no caption: its own group, so the solid line closes it and it never reads
 * as one more row of the group beside it (#272, #275).
 */
export function SwitchGroup(props: SwitchRowProps): React.JSX.Element {
  return (
    <RowGroup>
      <SwitchRow {...props} />
    </RowGroup>
  );
}

export type ActionRowProps = {
  title: string;
  /** The current state in words, such as «Signed in as …dd85», under the title. */
  subtitle?: string;
  /** The row's action, at its trailing edge, as native Settings puts one (#411). */
  action: {label: string; onPress: () => void; accessibilityLabel?: string; disabled?: boolean};
  /** A second action before it, such as Cancel while the row asks to confirm. */
  secondAction?: {label: string; onPress: () => void};
};

/**
 * A setting with an action instead of a switch, such as an account and its «Sign out» (#411): one
 * `ListRow` whose trailing control is a `row` button, so the actions of every row share a column
 * and no action stands apart from the row it belongs to.
 */
export function ActionRow({title, subtitle, action, secondAction}: ActionRowProps): React.JSX.Element {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      trailing={
        <View style={shared.row}>
          {secondAction && <Button kind="row" label={secondAction.label} onPress={secondAction.onPress} />}
          <Button
            kind="row"
            label={action.label}
            accessibilityLabel={action.accessibilityLabel}
            disabled={action.disabled}
            onPress={action.onPress}
          />
        </View>
      }
    />
  );
}

/**
 * One value of a `ChoiceList`. With `unavailable`, the reason it cannot be picked, such as «No word
 * list is installed»: its row shows greyed out with the reason under it and does not act (#398).
 */
export type Choice<V> = {value: V; label: string; unavailable?: string};

export type ChoiceListProps<V> = {
  /** The setting's name, the caption over its values. */
  title: string;
  choices: readonly Choice<V>[];
  value: V;
  onChange: (value: V) => void;
  /** What explains the choice, under its last value (`RowGroup`'s note). */
  note?: string;
};

/** The `nativeID` of a list of radio rows, which the render rules find it by (#299). */
export const RADIO_LIST_ID = 'radio-list';

/**
 * One value out of several; each radio speaks «<title>: <value>». The list ends further from the
 * screen's edge than other rows, as the native list of radio rows does (#299).
 */
export function ChoiceList<V>({
  title,
  choices,
  value,
  onChange,
  note,
}: ChoiceListProps<V>): React.JSX.Element {
  return (
    <View nativeID={RADIO_LIST_ID} style={styles.radioList}>
      <RowGroup caption={title} note={note}>
        {choices.map(choice => {
          const disabled = choice.unavailable !== undefined;
          return (
            <ListRow
              key={choice.label}
              title={choice.label}
              subtitle={choice.unavailable}
              // The whole row chooses, its label too, not only the radio at its end (#554).
              onPress={() => onChange(choice.value)}
              control={{role: 'radio', label: `${title}: ${choice.label}`, checked: choice.value === value, ...(disabled ? {disabled} : {})}}
              trailing={<Radio checked={choice.value === value} disabled={disabled} />}
            />
          );
        })}
      </RowGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {marginBottom: metrics.sectionGap},
  radioList: {marginRight: metrics.radioListTrailingMargin - metrics.sideMargin},
  separator: {height: metrics.separator, backgroundColor: metrics.ink},
  lightBox: {height: metrics.lightLine, overflow: 'hidden'},
  lightDashes: {
    // Any height over two borders: the box above shows only the top one.
    height: metrics.markStroke,
    borderWidth: metrics.lightLine,
    borderStyle: 'dashed',
    borderColor: metrics.ink,
  },
  note: {paddingBottom: metrics.rowPadding},
});
