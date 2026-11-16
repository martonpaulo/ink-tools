package com.supernotetools.dialect;

import android.content.Context;
import android.content.Intent;
import android.os.Environment;
import android.os.SystemClock;
import android.util.Log;
import java.io.IOException;
import java.util.List;

/** One tap from either surface: switch the file, tell the system, log one line. */
final class Switcher {
  static final String TAG = "Dialect";

  /**
   * What the Settings app broadcasts after a change (`HWLanguageSetting.changeDefault`); the
   * keyboard and the Settings label refresh from it. Recognition reads the file on each call.
   */
  static final String CHANGED = "hw_type_change";

  private Switcher() {}

  /** The new code; throws with a message the settings screen shows. */
  static String next(Context context, String surface) throws IOException {
    long start = SystemClock.elapsedRealtime();
    try {
      if (!Environment.isExternalStorageManager()) {
        throw new IOException(Copy.FILES_OFF);
      }
      LanguageFiles.Switch step = files().cycle(new Prefs(context).cycle());
      context.sendBroadcast(new Intent(CHANGED));
      Log.i(TAG, "surface=" + surface + " from=" + step.from + " to=" + step.to
          + " ms=" + (SystemClock.elapsedRealtime() - start));
      return step.to;
    } catch (IOException | RuntimeException error) {
      Log.e(TAG, "surface=" + surface + " error=" + error.getMessage());
      throw error instanceof IOException ? (IOException) error : new IOException(error.getMessage(), error);
    }
  }

  /** The active code, or null when unknown; throws when the folder cannot be read. */
  static String current() throws IOException {
    return files().current();
  }

  static List<String> installed() throws IOException {
    return files().installed();
  }

  private static LanguageFiles files() {
    return new LanguageFiles(new AndroidFiles(), AndroidFiles.root());
  }
}
