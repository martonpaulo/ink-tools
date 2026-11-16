package com.supernotetools.lingo;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

/** The app's two preferences: where the floating button shows, and the codes in the cycle. */
final class Prefs {
  private static final String FILE = "lingo";
  private static final String BUTTON = "button";
  private static final String CYCLE = "cycle";

  private final SharedPreferences store;

  Prefs(Context context) {
    store = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
  }

  /** Where the floating button shows; ButtonRule.DEFAULT until the owner changes it (#195). */
  ButtonRule.Mode button() {
    return ButtonRule.mode(store.getString(BUTTON, null));
  }

  void setButton(ButtonRule.Mode mode) {
    store.edit().putString(BUTTON, mode.key).apply();
  }

  /** The chosen codes; LanguageCycle.DEFAULT until the owner changes them. */
  Set<String> cycle() {
    return new HashSet<>(store.getStringSet(CYCLE, new HashSet<>(LanguageCycle.DEFAULT)));
  }

  void setCycle(Set<String> codes) {
    store.edit().putStringSet(CYCLE, new HashSet<>(codes)).apply();
  }
}
