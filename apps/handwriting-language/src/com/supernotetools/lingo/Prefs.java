package com.supernotetools.lingo;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

/** The app's preferences: where the floating button shows and sits, and the codes in the cycle. */
final class Prefs {
  private static final String FILE = "lingo";
  private static final String BUTTON = "button";
  private static final String CYCLE = "cycle";
  private static final String PLACE_X = "place_x";
  private static final String PLACE_Y = "place_y";

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

  /** The floating button's place as ButtonPlace fractions, or null until the owner drags it (#244). */
  float[] place() {
    if (!store.contains(PLACE_X) || !store.contains(PLACE_Y)) {
      return null;
    }
    return new float[] {store.getFloat(PLACE_X, ButtonPlace.DEFAULT_X), store.getFloat(PLACE_Y, 0f)};
  }

  void setPlace(float x, float y) {
    store.edit().putFloat(PLACE_X, x).putFloat(PLACE_Y, y).apply();
  }

  /** Back to the default place, low on the trailing edge, clear of the note toolbar (#587). */
  void clearPlace() {
    store.edit().remove(PLACE_X).remove(PLACE_Y).apply();
  }
}
