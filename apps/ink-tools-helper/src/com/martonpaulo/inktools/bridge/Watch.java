package com.martonpaulo.inktools.bridge;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The firmware watch on the tablet (#293, docs/architecture.md › Layer rules): when the environment
 * fingerprint changes, one probe per registry item, each item read as ok, broken or unprobed. Pure
 * Java, so the JVM tests run it; {@code Probes} gives it the Android checks.
 */
final class Watch {
  enum Status { OK, BROKEN, UNPROBED }

  /** One check of an item on this tablet: null when the item holds, else what changed. A throw counts as broken. */
  interface Probe {
    String check() throws Exception;
  }

  /** One item's result: its status and, for broken or unprobed, the reason. */
  static final class Result {
    final Registry.Item item;
    final Status status;
    final String detail;

    Result(Registry.Item item, Status status, String detail) {
      this.item = item;
      this.status = status;
      this.detail = detail;
    }
  }

  private Watch() {}

  /**
   * SHA-256, in hex, of {@code Build.FINGERPRINT}, each vendor package with its versionCode in name
   * order, and the registry's version. Versions are labels, never gates: any change runs the watch.
   */
  static String fingerprint(String firmware, Map<String, Long> versions, String registryVersion) {
    StringBuilder text = new StringBuilder("firmware=").append(firmware).append('\n');
    for (Map.Entry<String, Long> app : new TreeMap<>(versions).entrySet()) {
      text.append(app.getKey()).append('=').append(app.getValue()).append('\n');
    }
    text.append("registry=").append(registryVersion);
    try {
      StringBuilder hex = new StringBuilder();
      for (byte part : MessageDigest.getInstance("SHA-256").digest(text.toString().getBytes(StandardCharsets.UTF_8))) {
        hex.append(String.format("%02x", part));
      }
      return hex.toString();
    } catch (NoSuchAlgorithmException missing) {
      throw new IllegalStateException("SHA-256 is part of every Java runtime", missing);
    }
  }

  /** Whether a run is due: the fingerprint differs from the last one seen, or none was seen. */
  static boolean due(String fingerprint, String last) {
    return !fingerprint.equals(last);
  }

  /**
   * One result per item, in the registry's order. An item whose kill switch is off, or that has
   * no safe probe, reads unprobed with its reason; an item whose probe runs in another tool names
   * that probe; a probe that throws makes its item broken and the others still run.
   */
  static List<Result> run(List<Registry.Item> items, Map<String, Probe> probes) {
    List<Result> results = new ArrayList<>();
    for (Registry.Item item : items) {
      Probe probe = probes.get(item.id);
      if (item.off != null) {
        results.add(new Result(item, Status.UNPROBED, "turned off " + item.off));
      } else if (item.unprobed != null) {
        results.add(new Result(item, Status.UNPROBED, item.unprobed));
      } else if (probe == null) {
        results.add(new Result(item, Status.UNPROBED, "probed by " + item.probe));
      } else {
        results.add(checked(item, probe));
      }
    }
    return Collections.unmodifiableList(results);
  }

  private static Result checked(Registry.Item item, Probe probe) {
    try {
      String changed = probe.check();
      return changed == null ? new Result(item, Status.OK, null) : new Result(item, Status.BROKEN, changed);
    } catch (Exception error) {
      return new Result(item, Status.BROKEN, error.toString());
    }
  }

  /** The items a run found broken, in order. */
  static List<Result> broken(List<Result> results) {
    List<Result> found = new ArrayList<>();
    for (Result result : results) {
      if (result.status == Status.BROKEN) {
        found.add(result);
      }
    }
    return found;
  }

  /**
   * The answer inkctl reads, one line: the fingerprint, then each item probed here with its status
   * and, when broken, what changed, separated by {@code " | "}; an item probed elsewhere is left to
   * the tool that probes it. A detail never holds the separator.
   */
  static String line(String fingerprint, List<Result> results) {
    StringBuilder line = new StringBuilder("watch ").append(fingerprint);
    for (Result result : results) {
      if (result.status == Status.UNPROBED && result.detail.startsWith("probed by ")) {
        continue;
      }
      line.append(" | ").append(result.item.id).append(' ').append(result.status.name().toLowerCase(java.util.Locale.ROOT));
      if (result.status == Status.BROKEN) {
        line.append(' ').append(result.detail.replace('|', '/'));
      }
    }
    return line.toString();
  }
}
