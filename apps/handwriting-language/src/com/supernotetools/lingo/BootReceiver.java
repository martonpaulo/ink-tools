package com.supernotetools.lingo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the floating button again after a restart or an update of the app, unless it is hidden. */
public final class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (ButtonRule.restartsOn(intent.getAction(), new Prefs(context).button())) {
      OverlayService.start(context);
    }
  }
}
