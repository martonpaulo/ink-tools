package com.supernotetools.lingo;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;
import java.util.regex.Pattern;

/** The language cycle: which code comes next and the short label the button shows. Pure Java. */
final class LanguageCycle {
  /** The cycle a new install starts with, and the order every cycle keeps (#157). */
  static final List<String> DEFAULT = Collections.unmodifiableList(Arrays.asList("pt_BR", "en_US", "es_ES"));

  /** The device reads an empty `default/` folder as English (docs/research/2026-11-handwriting-language.md § 4). */
  static final String EMPTY_FOLDER_LANGUAGE = "en_US";

  private static final Pattern CODE = Pattern.compile("[a-z]{2}_[A-Z]{2}");

  private LanguageCycle() {}

  /** True for a language code in the device's form, `pt_BR`. */
  static boolean isCode(String name) {
    return name != null && CODE.matcher(name).matches();
  }

  /**
   * The codes in cycle order: those of DEFAULT in its order, then the others alphabetically.
   * Shortcut: the order is fixed; the settings screen chooses members only. Upgrade when the
   * owner asks for a chosen order.
   */
  static List<String> order(Collection<String> codes) {
    List<String> ordered = new ArrayList<>();
    for (String code : DEFAULT) {
      if (codes.contains(code)) {
        ordered.add(code);
      }
    }
    for (String code : new TreeSet<>(codes)) {
      if (!ordered.contains(code)) {
        ordered.add(code);
      }
    }
    return ordered;
  }

  /**
   * The code after `current`; the cycle's first when `current` is null (unknown) or outside the
   * cycle. Throws for an empty cycle: there is nothing to switch to.
   */
  static String next(List<String> cycle, String current) {
    if (cycle.isEmpty()) {
      throw new IllegalArgumentException("the cycle is empty");
    }
    int index = current == null ? -1 : cycle.indexOf(current);
    return cycle.get((index + 1) % cycle.size());
  }

  /**
   * The button's short label: the language part, `PT`; the country part, `TW`, when another code
   * of the cycle has the same language part.
   */
  static String label(String code, List<String> cycle) {
    String language = code.substring(0, 2);
    for (String other : cycle) {
      if (!other.equals(code) && other.startsWith(language + "_")) {
        return code.substring(3);
      }
    }
    return language.toUpperCase(Locale.ROOT);
  }

  /** The language's English name, `Portuguese (Brazil)`. */
  static String name(String code) {
    return new Locale(code.substring(0, 2), code.substring(3)).getDisplayName(Locale.ENGLISH);
  }
}
