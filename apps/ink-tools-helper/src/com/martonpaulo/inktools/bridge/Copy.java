package com.martonpaulo.inktools.bridge;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The bridge's sentences for a person, by copy key (#294): inkctl prints the answer's data as it is,
 * so a failure reads as one sentence with the next step; its detail stays in the InkToolsBridge log.
 */
final class Copy {
  /** PluginHost's interface no longer matches the registry, so the call was refused before it went out. */
  static final String HOST_CHANGED = "hostChanged";

  /** The registry's kill switch turned the host calls off, so nothing was sent (#293). */
  static final String TURNED_OFF = "turnedOff";

  static final Map<String, String> FAILURES;

  static {
    Map<String, String> failures = new HashMap<>();
    failures.put(HOST_CHANGED, "PluginHost changed in a firmware update, so the bridge refused this call."
        + " Read the reason with: inkctl logs --tag InkToolsBridge");
    failures.put(TURNED_OFF, "Plugin changes through the helper are turned off in this version, as a firmware update changed PluginHost."
        + " Update Ink Tools to turn them on again.");
    FAILURES = Collections.unmodifiableMap(failures);
  }

  /** The firmware watch's notice (#293): its channel, its title and one sentence per broken feature. */
  static final String WATCH_CHANNEL = "Firmware check";
  static final String WATCH_TITLE = "A firmware update changed what Ink Tools uses";
  /** What each owning tool does, as a person names it; the registry's owner ids are the keys. */
  static final Map<String, String> FEATURES;

  static {
    Map<String, String> features = new HashMap<>();
    features.put("sn-adapter", "Calendar, To-Do and Digest sync in the plugins");
    features.put("ink-tools-helper", "Plugin install and settings from a computer");
    FEATURES = Collections.unmodifiableMap(features);
  }

  /** One sentence per broken feature, in the registry's order, each naming what stops and what to do. */
  static String watchNotice(List<Watch.Result> broken) {
    Set<String> owners = new LinkedHashSet<>();
    for (Watch.Result result : broken) {
      owners.add(result.item.owner);
    }
    StringBuilder text = new StringBuilder();
    for (String owner : owners) {
      String feature = FEATURES.get(owner);
      if (feature == null) {
        throw new IllegalStateException("no copy for the feature of " + owner);
      }
      text.append(text.length() == 0 ? "" : " ").append(feature)
          .append(" no longer works on this firmware and stays stopped until Ink Tools is updated.");
    }
    return text.append(" To see what changed, run on a computer: inkctl firmware check").toString();
  }

  private Copy() {}
}
