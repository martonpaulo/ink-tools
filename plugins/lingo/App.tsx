import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

/** Empty settings view. The language-pair switches and the lasso flow land with their own issues. */
export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Lingo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 24, backgroundColor: '#fff'},
  title: {fontSize: 28, color: '#000'},
});
