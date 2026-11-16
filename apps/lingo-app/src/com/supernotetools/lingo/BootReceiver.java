package com.supernotetools.lingo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the floating button again after a restart unless it is hidden. */
public final class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) && new Prefs(context).button() != ButtonRule.Mode.HIDDEN) {
      OverlayService.start(context);
    }
  }
}
