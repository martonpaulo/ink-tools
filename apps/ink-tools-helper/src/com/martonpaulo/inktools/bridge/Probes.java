package com.martonpaulo.inktools.bridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The Android side of the firmware watch (#293): the fingerprint's inputs, one read-only probe per
 * registry item this app can check, the last fingerprint seen, and the notice. Every probe only
 * resolves or loads; none starts, writes or calls anything on the device.
 */
final class Probes {
  private static final String PREFS = "watch";
  private static final String LAST = "fingerprint";
  private static final String CHANNEL = "firmware-watch";
  private static final int NOTICE_ID = 293;

  private final Context context;
  private final PackageManager packages;

  Probes(Context context) {
    this.context = context;
    this.packages = context.getPackageManager();
  }

  /**
   * Runs the watch when the fingerprint changed since the last run, or always with {@code force};
   * null when it was not due. Logs each result and posts the notice when an item is broken.
   */
  Outcome watch(boolean force) {
    String fingerprint = Watch.fingerprint(Build.FINGERPRINT, vendorVersions(), Registry.VERSION);
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!force && !Watch.due(fingerprint, prefs.getString(LAST, null))) {
      Log.i(Bridge.TAG, "watch fingerprint=" + fingerprint + " unchanged");
      return Outcome.of(Outcome.OK, "watch " + fingerprint + " unchanged");
    }
    List<Watch.Result> results = Watch.run(Registry.ITEMS, probes());
    for (Watch.Result result : results) {
      Log.i(Bridge.TAG, "watch item=" + result.item.id + " status=" + result.status
          + (result.detail == null ? "" : " detail=" + result.detail));
    }
    List<Watch.Result> broken = Watch.broken(results);
    notice(broken);
    prefs.edit().putString(LAST, fingerprint).apply();
    return Outcome.of(broken.isEmpty() ? Outcome.OK : Outcome.FAILED, Watch.line(fingerprint, results));
  }

  /**
   * Each vendor package this app can see, with its versionCode. shortcut: Android 11 shows an app
   * only the packages its manifest's queries name, so a vendor app outside them changes no
   * fingerprint; Build.FINGERPRINT changes with every firmware, which ships those apps. Upgrade to
   * inkctl's full list (pm list packages) when an app updates apart from the firmware.
   */
  private Map<String, Long> vendorVersions() {
    Map<String, Long> versions = new HashMap<>();
    for (PackageInfo info : packages.getInstalledPackages(0)) {
      if (info.packageName.startsWith(Registry.SystemDeviceIdentity.VENDOR_PACKAGE_PREFIX)) {
        versions.put(info.packageName, info.getLongVersionCode());
      }
    }
    return versions;
  }

  private Map<String, Watch.Probe> probes() {
    Map<String, Watch.Probe> probes = new HashMap<>();
    probes.put("calendar.provider", () -> provider(Registry.CalendarProvider.AUTHORITY));
    probes.put("todo.provider", () -> provider(Registry.TodoProvider.AUTHORITY));
    probes.put("digest.provider", () -> provider(Registry.DigestProvider.AUTHORITY));
    probes.put("pluginhost.setting-service", () -> {
      Intent intent = new Intent(HostCalls.DESCRIPTOR).setComponent(new ComponentName(HostCalls.HOST_PACKAGE, HostCalls.SERVICE));
      return packages.resolveService(intent, 0) == null ? "no service " + HostCalls.SERVICE + " in " + HostCalls.HOST_PACKAGE : null;
    });
    probes.put("pluginhost.parcel-classes", () -> {
      HostClasses.load(context);
      return null;
    });
    probes.put("pluginhost.call-numbers", () ->
        HostCalls.callNumbersChanged(Bridge.transactions(HostClasses.load(context).loader, HostCalls.DESCRIPTOR)));
    return probes;
  }

  private String provider(String authority) {
    return packages.resolveContentProvider(authority, 0) == null ? "no provider answers " + authority : null;
  }

  /** One notice for a run with broken items, each with its sentence from Copy; none removes it. */
  private void notice(List<Watch.Result> broken) {
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (broken.isEmpty()) {
      manager.cancel(NOTICE_ID);
      return;
    }
    manager.createNotificationChannel(new NotificationChannel(CHANNEL, Copy.WATCH_CHANNEL, NotificationManager.IMPORTANCE_DEFAULT));
    String text = Copy.watchNotice(broken);
    manager.notify(NOTICE_ID, new Notification.Builder(context, CHANNEL)
        .setSmallIcon(context.getApplicationInfo().icon)
        .setContentTitle(Copy.WATCH_TITLE)
        .setContentText(text)
        .setStyle(new Notification.BigTextStyle().bigText(text))
        .build());
  }
}
