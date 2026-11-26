package com.martonpaulo.inktools.bridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * The entry point from {@code adb shell am broadcast} (#215). Ordered, so {@code am} waits and
 * prints the result code and data, which inkctl reads; the manifest guards it with DUMP, which
 * the shell holds and no installed app can.
 */
public final class CommandReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    final PendingResult pending = goAsync();
    final Context app = context.getApplicationContext();
    Command parsed;
    try {
      parsed = Command.parse(
          intent.getStringExtra("op"),
          intent.getStringExtra("path"),
          intent.getStringExtra("pluginID"),
          intent.getStringExtra("perm"),
          intent.hasExtra("status") ? intent.getIntExtra("status", Command.STATUS_ALWAYS) : null);
    } catch (IllegalArgumentException error) {
      finish(pending, Outcome.of(Outcome.USAGE, error.getMessage()));
      return;
    }
    final Command command = parsed;
    new Thread(() -> finish(pending, new Bridge(app).run(command)), "ink-tools-helper").start();
  }

  private static void finish(PendingResult pending, Outcome outcome) {
    Log.i(Bridge.TAG, "result=" + outcome.code + " " + outcome.data);
    pending.setResult(outcome.code, outcome.data, null);
    pending.finish();
  }
}
