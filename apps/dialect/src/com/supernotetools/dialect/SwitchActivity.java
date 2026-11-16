package com.supernotetools.dialect;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import java.io.IOException;

/**
 * Surface B, the launcher and sidebar entry: one tap moves to the next language with nothing on
 * screen (Theme.NoDisplay, so it finishes before it would draw). A failure opens the settings
 * screen with the reason instead of failing silently.
 */
public final class SwitchActivity extends Activity {
  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    try {
      Switcher.next(this, "launcher");
    } catch (IOException error) {
      startActivity(new Intent(this, SettingsActivity.class)
          .putExtra(SettingsActivity.EXTRA_ERROR, error.getMessage())
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }
    finish();
    overridePendingTransition(0, 0);
  }
}
