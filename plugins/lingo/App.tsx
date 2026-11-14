import React from 'react';
import {Text, View} from 'react-native';
import {shared} from '@supernote-tools/ui-kit';

/**
 * Empty settings view, with every size and colour from the shared ui-kit (#93). The language-pair
 * switches and the lasso flow land with their own issues.
 */
export default function App() {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        Lingo
      </Text>
    </View>
  );
}
