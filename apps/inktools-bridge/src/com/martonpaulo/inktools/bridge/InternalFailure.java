package com.martonpaulo.inktools.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The one failure value of the Java adapter for a Supernote internal (#294, docs/architecture.md ›
 * Layer rules, «A failure reads as a sentence»), as sn-adapter's src/failure.ts defines it: the
 * person sees one friendly sentence, chosen by a copy key from the tool's own copy; the agent's log
 * carries every detail: the registry item, the method, the firmware fingerprint, the app versions
 * and the whole cause chain with each stack. Pure Java, so the JVM tests run it.
 */
final class InternalFailure extends Exception {
  private static final long serialVersionUID = 1L;
  /** What the log says for an app version or a fingerprint that could not be read. */
  static final String UNREAD = "unread";

  final transient Registry.Item item;
  /** The operation that failed, in our words or the host's, such as {@code uninstall}. */
  final String method;
  /** The key of the person's sentence in the tool's copy. */
  final String copyKey;
  /** {@code Build.FINGERPRINT}, or {@link #UNREAD}. */
  final String firmware;
  /** Each vendor app's version name, by package, in the caller's order. */
  final Map<String, String> apps;

  /** The failure of registry item {@code id}; an id the registry does not hold is a bug, so it throws. */
  InternalFailure(String id, String method, String copyKey, String firmware, Map<String, String> apps, Throwable cause) {
    super(id + " " + method, cause);
    this.item = item(id);
    this.method = method;
    this.copyKey = copyKey;
    this.firmware = firmware;
    this.apps = Collections.unmodifiableMap(new LinkedHashMap<>(apps));
  }

  static Registry.Item item(String id) {
    for (Registry.Item entry : Registry.ITEMS) {
      if (entry.id.equals(id)) {
        return entry;
      }
    }
    throw new IllegalArgumentException("no registry item " + id);
  }

  /** The person's sentence: the tool's copy for the key. A missing key throws, never a blank. */
  String userSentence(Map<String, String> copy) {
    String sentence = copy.get(copyKey);
    if (sentence == null || sentence.isEmpty()) {
      throw new IllegalStateException("no copy for " + copyKey);
    }
    return sentence;
  }

  /** Each throwable of the chain, outermost first, as {@code Class: message} and its stack; a loop ends it. */
  static List<String> causeChain(Throwable cause) {
    List<String> chain = new ArrayList<>();
    Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
    for (Throwable current = cause; current != null && seen.add(current); current = current.getCause()) {
      String name = current.getClass().getName();
      StringBuilder entry = new StringBuilder(current.getMessage() == null ? name : name + ": " + current.getMessage());
      for (StackTraceElement frame : current.getStackTrace()) {
        entry.append("\n\tat ").append(frame);
      }
      chain.add(entry.toString());
    }
    return chain;
  }

  /** The agent's log text: one header line of every field, then each cause with its stack. */
  String agentLog() {
    StringBuilder apps = new StringBuilder();
    for (Map.Entry<String, String> app : this.apps.entrySet()) {
      apps.append(apps.length() == 0 ? "" : ",").append(app.getKey()).append('@').append(app.getValue());
    }
    StringBuilder log = new StringBuilder()
        .append("registry=").append(item.id)
        .append(" level=").append(item.level)
        .append(" owner=").append(item.owner)
        .append(" active=").append(item.active)
        .append(" method=").append(method)
        .append(" firmware=").append(firmware)
        .append(" apps=").append(apps.length() == 0 ? UNREAD : apps);
    for (String entry : causeChain(getCause())) {
      log.append("\ncause ").append(entry);
    }
    return log.toString();
  }
}
