package com.martonpaulo.inktools.bridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Runs the firmware watch at each boot (#293): a firmware update always ends in a boot, and a
 * plugin may never see a first start after it. The watch runs its probes only when the
 * environment fingerprint changed; its results go to the InkToolsBridge log and, when an item is
 * broken, to one notice.
 */
public final class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
      return;
    }
    final PendingResult pending = goAsync();
    final Context app = context.getApplicationContext();
    new Thread(() -> {
      try {
        Outcome outcome = new Probes(app).watch(false);
        Log.i(Bridge.TAG, "boot " + outcome.data);
      } catch (RuntimeException error) {
        Log.e(Bridge.TAG, "boot watch failed", error);
      } finally {
        pending.finish();
      }
    }, "ink-tools-helper-boot").start();
  }
}
