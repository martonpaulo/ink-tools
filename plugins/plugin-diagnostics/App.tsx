import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {runProbe} from './src/probe';

/**
 * Runs the probe when «Run Probe» is pressed and shows its log lines; the same lines go to logcat.
 * Not on mount: the host mounts this component at the first press of «Run Command» too, even with
 * no view (docs/supernote.md › Plugins), and that press must not run the probe (#148).
 * A Back button closes the plugin view (`closePluginView`), so the probe can run again in a fresh
 * view without a reboot — needed to test the background lifecycle (#39).
 */
export default function App() {
  const [lines, setLines] = useState<string[]>([]);
  const run = () => {
    setLines(['running…']);
    runProbe(PluginManager as unknown as Record<string, unknown>).then(setLines);
  };
  return (
    <ScrollView style={styles.root}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          PluginManager.closePluginView().catch(error => {
            console.error(`Probe: ${error.message}`);
          });
        }}
        style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Probe</Text>
      <Pressable accessibilityRole="button" onPress={run} style={styles.back}>
        <Text style={styles.backText}>Run Probe</Text>
      </Pressable>
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
