package com.probe.providers;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import java.net.ServerSocket;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Issue #59: can a plugin (PluginHost's uid) reach the Digest provider that adb is denied?
 * Runs a query and a marked, reverted dry insert against each target of {@link ProbeTargets} and
 * logs every outcome, or its SecurityException, to logcat tag SNPROBE. The same lines go back to
 * JavaScript. Never logs a row value.
 */
public final class ProbeProvidersModule extends ReactContextBaseJavaModule {
  static final String TAG = "SNPROBE";
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private ScheduledExecutorService heartbeat;

  public ProbeProvidersModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "ProbeProviders";
  }

  @Override
  public void invalidate() {
    worker.shutdownNow();
    stopHeartbeat();
    super.invalidate();
  }

  /** Issue #148: the text of inkctl's command file; rejects with a one-line reason (ProbeCommandFile). */
  @ReactMethod
  public void readCommand(final String path, final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              promise.resolve(ProbeCommandFile.read(path));
            } catch (Throwable error) {
              promise.reject("read_failed", ProbeFormat.oneLine(String.valueOf(error.getMessage())));
            }
          }
        });
  }

  /** Resolves with every line logged, in order. Never rejects: a failure is a result line. */
  @ReactMethod
  public void run(final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            List<String> lines = new ArrayList<>();
            ContentResolver resolver = getReactApplicationContext().getContentResolver();
            for (ProbeTargets.Target target : ProbeTargets.all()) {
              query(resolver, target, lines);
              if (target.writable) {
                dryInsert(resolver, target, lines);
              }
            }
            WritableArray out = Arguments.createArray();
            for (String line : lines) {
              out.pushString(line);
            }
            promise.resolve(out);
          }
        });
  }

  /**
   * Logs a line every few seconds for about 30 s (bridge background-lifecycle question, #39): close
   * the plugin view and watch whether the lines go on. Calling it again restarts it.
   */
  @ReactMethod
  public void startHeartbeat() {
    stopHeartbeat();
    final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    heartbeat = timer;
    final int[] beat = {0};
    timer.scheduleAtFixedRate(
        new Runnable() {
          @Override
          public void run() {
            beat[0]++;
            Log.i(TAG, "heartbeat " + beat[0] + " (about " + beat[0] * 5 + " s)");
            if (beat[0] >= 6) {
              timer.shutdown();
            }
          }
        },
        5,
        5,
        TimeUnit.SECONDS);
  }

  /**
   * Issue #91: opens a TCP listener on a free port and resolves with its port and the device's
   * addresses at once, then waits two minutes for one connection and logs the outcome to logcat tag
   * SNPROBE. Never rejects: a refusal is a result line.
   */
  @ReactMethod
  public void startListener(final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            List<String> lines = new ArrayList<>();
            final ServerSocket server;
            try {
              server = ProbeListener.open();
              emit(lines, ProbeFormat.ok("listen", "open", "port " + server.getLocalPort()));
              for (String address : ProbeListener.addresses()) {
                emit(lines, ProbeFormat.ok("listen", "address", address));
              }
            } catch (Throwable error) {
              emit(lines, ProbeFormat.failed("listen", "open", error));
              resolveLines(promise, lines);
              return;
            }
            resolveLines(promise, lines);
            Log.i(TAG, ProbeListener.awaitOne(server, 120000));
            try {
              server.close();
            } catch (Throwable ignored) {
              // Nothing to do: the probe is over.
            }
          }
        });
  }

  private static void resolveLines(Promise promise, List<String> lines) {
    WritableArray out = Arguments.createArray();
    for (String line : lines) {
      out.pushString(line);
    }
    promise.resolve(out);
  }

  private synchronized void stopHeartbeat() {
    if (heartbeat != null) {
      heartbeat.shutdownNow();
      heartbeat = null;
    }
  }

  private static void emit(List<String> lines, String line) {
    Log.i(TAG, line);
    lines.add(line);
  }

  private static void query(ContentResolver resolver, ProbeTargets.Target target, List<String> lines) {
    try (Cursor cursor = resolver.query(Uri.parse(target.uri), null, null, null, null)) {
      if (cursor == null) {
        emit(lines, ProbeFormat.ok(target.label, "query", "null cursor (no provider, or not reachable)"));
      } else {
        emit(
            lines,
            ProbeFormat.ok(
                target.label,
                "query",
                cursor.getCount() + " rows, " + ProbeFormat.columns(cursor.getColumnNames())));
      }
    } catch (Throwable error) {
      emit(lines, ProbeFormat.failed(target.label, "query", error));
    }
  }

  /** Inserts one row marked {@link ProbeTargets#MARKER}, then deletes only rows carrying it. */
  private static void dryInsert(ContentResolver resolver, ProbeTargets.Target target, List<String> lines) {
    Uri base = Uri.parse(target.uri);
    String where = target.markerColumn + " = ?";
    String[] args = {ProbeTargets.MARKER};
    boolean inserted = false;
    try {
      ContentValues values = new ContentValues();
      for (Map.Entry<String, Object> column : target.row(System.currentTimeMillis()).entrySet()) {
        Object value = column.getValue();
        if (value instanceof Integer) {
          values.put(column.getKey(), (Integer) value);
        } else if (value instanceof Long) {
          values.put(column.getKey(), (Long) value);
        } else {
          values.put(column.getKey(), String.valueOf(value));
        }
      }
      Uri created = resolver.insert(base, values);
      inserted = ProbeTargets.wroteRow(created != null, created == null ? null : created.getLastPathSegment());
      emit(lines, ProbeFormat.ok(target.label, "insert", inserted ? "row created" : "no row (refused: " + created + ")"));
    } catch (Throwable error) {
      emit(lines, ProbeFormat.failed(target.label, "insert", error));
    }
    try {
      int removed = resolver.delete(base, where, args);
      emit(lines, ProbeFormat.ok(target.label, "delete-marked", removed + " rows removed"));
      if (inserted && removed == 0) {
        emit(lines, target.label + " LEFTOVER: a marked row may remain; delete rows where " + where.replace("?", "'" + ProbeTargets.MARKER + "'"));
      }
    } catch (Throwable error) {
      emit(lines, ProbeFormat.failed(target.label, "delete-marked", error));
      if (inserted) {
        emit(lines, target.label + " LEFTOVER: a marked row may remain; delete rows where " + where.replace("?", "'" + ProbeTargets.MARKER + "'"));
      }
    }
  }
}
