package com.supernotetools.lingo;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;
import android.os.SystemClock;
import android.util.Log;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** One tap from either surface: switch the file, tell the system, log one line. */
final class Switcher {
  static final String TAG = "LingoApp";

  private Switcher() {}

  /** The new code; throws with a message the settings screen shows. */
  static String next(Context context, String surface) throws IOException {
    long start = SystemClock.elapsedRealtime();
    try {
      if (!Environment.isExternalStorageManager()) {
        throw new FileFailure(FileFailure.Kind.FILES_OFF, "all-files access is off");
      }
      LanguageFiles.Switch step = files().cycle(new Prefs(context).cycle());
      // The keyboard and the Settings label refresh from it; recognition reads the file on each call.
      context.sendBroadcast(new Intent(Registry.HandwritingChangedBroadcast.ACTION));
      Log.i(TAG, "surface=" + surface + " from=" + step.from + " to=" + step.to
          + " ms=" + (SystemClock.elapsedRealtime() - start));
      return step.to;
    } catch (IOException | RuntimeException error) {
      InternalFailure internal = error instanceof FileFailure
          ? ((FileFailure) error).internal("switch", Build.FINGERPRINT, settingsVersion(context)) : null;
      Log.e(TAG, "surface=" + surface + (internal != null ? " " + internal.agentLog() : " error=" + error.getMessage()));
      throw error instanceof IOException ? (IOException) error : new IOException(error.getMessage(), error);
    }
  }

  /** The Settings app's version name, which reads the language file, for a failure's log (#294). */
  private static Map<String, String> settingsVersion(Context context) {
    String app = Registry.SettingsLanguagePage.PACKAGE;
    String version;
    try {
      version = context.getPackageManager().getPackageInfo(app, 0).versionName;
    } catch (PackageManager.NameNotFoundException missing) {
      version = InternalFailure.UNREAD;
    }
    return Collections.singletonMap(app, version == null ? InternalFailure.UNREAD : version);
  }

  /** The active code, or null when unknown; throws when the folder cannot be read. */
  static String current() throws IOException {
    return files().current();
  }

  static List<String> installed() throws IOException {
    return files().installed();
  }

  private static LanguageFiles files() {
    LanguageFiles.Disk disk = LanguageFiles.port(InternalFailure.item(FileFailure.LANGUAGE_FILE_ITEM),
        Collections.<String, LanguageFiles.Disk>singletonMap(LanguageFiles.ANDROID_FILES, new AndroidFiles()));
    return new LanguageFiles(disk, AndroidFiles.root());
  }
}
