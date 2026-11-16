package com.supernotetools.lingo;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

/** The app's two preferences: the floating button on or off, and the codes in the cycle. */
final class Prefs {
  private static final String FILE = "lingo";
  private static final String OVERLAY = "overlay";
  private static final String CYCLE = "cycle";

  private final SharedPreferences store;

  Prefs(Context context) {
    store = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
  }

  boolean overlay() {
    return store.getBoolean(OVERLAY, false);
  }

  void setOverlay(boolean on) {
    store.edit().putBoolean(OVERLAY, on).apply();
  }

  /** The chosen codes; LanguageCycle.DEFAULT until the owner changes them. */
  Set<String> cycle() {
    return new HashSet<>(store.getStringSet(CYCLE, new HashSet<>(LanguageCycle.DEFAULT)));
  }

  void setCycle(Set<String> codes) {
    store.edit().putStringSet(CYCLE, new HashSet<>(codes)).apply();
  }
}
