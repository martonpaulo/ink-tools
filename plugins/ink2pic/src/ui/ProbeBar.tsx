/**
 * The #75 device spike's button, above the call log; the results are log lines
 * (src/flow/penProbe.ts). While the
 * probe listens, «Probe on» and Stop probe show, so a stray tap is never silent. A tap while
 * either button's run is under way is ignored (#111). Shown only while PROBE_CONTROLS is true;
 * removed with the spike.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {PROBE_CONTROLS} from '../config';
import {
  onProbeArmed,
  probeArmed,
  runProbe,
  stopPenProbe,
} from '../flow/penProbe';
import {Button, shared} from '@ink-tools/ui-kit';
import {copy} from './copy';

export function ProbeBar({
  enabled = PROBE_CONTROLS,
}: {
  enabled?: boolean;
}): React.JSX.Element | null {
  const [armed, setArmed] = useState(probeArmed);
  useEffect(() => onProbeArmed(setArmed), []);
  const running = useRef(false);
  /** Runs `job` unless a run of either button is under way (#111). */
  const once = (job: () => Promise<void>) => async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      await job();
    } finally {
      running.current = false;
    }
  };
  if (!enabled) {
    return null;
  }
  return (
    <View>
      <View style={shared.row}>
        <Button label={copy['probe.run']} onPress={once(runProbe)} />
      </View>
      {armed ? (
        <View style={shared.row}>
          <Text accessibilityLiveRegion="polite" style={shared.text}>
            {copy['probe.on']}
          </Text>
          <Button label={copy['probe.stop']} onPress={stopPenProbe} />
        </View>
      ) : null}
    </View>
  );
}
