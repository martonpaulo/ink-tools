import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {runProbe} from './src/probe';

/**
 * Runs the probe once on open and shows its log lines; the same lines go to logcat.
 * A Back button closes the plugin view (`closePluginView`), so reopening Probe remounts this
 * component and re-runs the probe without a reboot — needed to test the background lifecycle (#39).
 */
export default function App() {
  const [lines, setLines] = useState<string[]>(['running…']);
  useEffect(() => {
    runProbe(PluginManager as unknown as Record<string, unknown>).then(setLines);
  }, []);
  return (
    <ScrollView style={styles.root}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void PluginManager.closePluginView();
        }}
        style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
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
  back: {alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 8},
  backText: {fontSize: 18, color: '#000'},
  title: {fontSize: 28, color: '#000'},
  line: {fontSize: 16, color: '#000', marginTop: 8},
});
