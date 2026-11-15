import React from 'react';
import {Text, View} from 'react-native';
import {shared} from '@supernote-tools/ui-kit';

/**
 * Empty settings view, with every size and colour from the shared ui-kit (#93). The mode settings
 * and the lasso flows land with their own issues (#110).
 */
export default function App() {
  return (
    <View style={shared.screen}>
      <Text accessibilityRole="header" style={shared.textLarge}>
        Lookup
      </Text>
    </View>
  );
}
