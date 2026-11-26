package com.martonpaulo.inktools.bridge;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * The bridge's sentences for a person, by copy key (#294): inkctl prints the answer's data as it is,
 * so a failure reads as one sentence with the next step; its detail stays in the InkToolsBridge log.
 */
final class Copy {
  /** PluginHost's interface no longer matches the registry, so the call was refused before it went out. */
  static final String HOST_CHANGED = "hostChanged";

  static final Map<String, String> FAILURES;

  static {
    Map<String, String> failures = new HashMap<>();
    failures.put(HOST_CHANGED, "PluginHost changed in a firmware update, so the bridge refused this call."
        + " Read the reason with: inkctl logs --tag InkToolsBridge");
    FAILURES = Collections.unmodifiableMap(failures);
  }

  private Copy() {}
}
