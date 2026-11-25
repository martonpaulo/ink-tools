/**
 * The one Close of every full view (#255): an outlined «Close» at the trailing edge of the title
 * line, as in the owner's picks (README › The owner's picks; card D69, option A). Its name and
 * place live only here, so another answer changes this file alone.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Button} from './Button';
import {CLOSE_TEXT} from './problem';
import {shared} from './styles';

export function CloseButton({onPress}: {onPress: () => void}): React.JSX.Element {
  return <Button label={CLOSE_TEXT} onPress={onPress} />;
}

/** The title at the leading edge and Close at the trailing edge of one line. */
export function TitleRow({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <View style={shared.row}>
      <Text accessibilityRole="header" style={[shared.textLarge, styles.title]}>
        {title}
      </Text>
      <CloseButton onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {flex: 1, fontWeight: 'bold'},
});
