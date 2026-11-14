import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {runProbe} from './src/probe';

/** Runs the probe once on open and shows its log lines; the same lines go to logcat. */
export default function App() {
  const [lines, setLines] = useState<string[]>(['running…']);
  useEffect(() => {
    runProbe(PluginManager as unknown as Record<string, unknown>).then(setLines);
  }, []);
  return (
    <ScrollView style={styles.root}>
      <Text style={styles.title}>Probe</Text>
      {lines.map((l, i) => (
        <Text key={i} style={styles.line}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 24, backgroundColor: '#fff'},
  title: {fontSize: 28, color: '#000'},
  line: {fontSize: 16, color: '#000', marginTop: 8},
});
