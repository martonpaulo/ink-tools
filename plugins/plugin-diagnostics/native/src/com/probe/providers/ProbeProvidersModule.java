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
import com.inktools.provider.ResolverTable;
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
                if (target.insertsOnProbe()) {
                  dryInsert(resolver, target, lines);
                } else {
                  testWrite(resolver, target, lines);
                }
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

  /**
   * The Calendar's write test (#213): an update selected by the row id {@link ProbeTargets#NO_ROW_ID},
   * which matches no row, so no «SNPROBE dry insert» row is left; its provider cannot delete one.
   * Then the revert cancels any marked row an older probe inserted, so none stays active.
   */
  private static void testWrite(ContentResolver resolver, ProbeTargets.Target target, List<String> lines) {
    Uri base = Uri.parse(target.uri);
    try {
      ContentValues values = new ContentValues();
      for (Map.Entry<String, Object> column : target.testWrite().entrySet()) {
        values.put(column.getKey(), String.valueOf(column.getValue()));
      }
      int changed =
          resolver.update(base, values, ProbeTargets.ROW_ID + " = ?", new String[] {ProbeTargets.NO_ROW_ID});
      emit(lines, ProbeFormat.ok(target.label, "test-write", changed + " rows changed by " + ProbeTargets.ROW_ID
          + " " + ProbeTargets.NO_ROW_ID + ", no row inserted"));
    } catch (Throwable error) {
      emit(lines, ProbeFormat.failed(target.label, "test-write", error));
    }
    revert(resolver, target, base, null, false, lines);
  }

  /**
   * Inserts one row marked {@link ProbeTargets#MARKER}, then deletes it, and every older marked row,
   * by row id ({@link ProbeRevert}, #213): the Calendar provider ignored a delete by the marker.
   */
  private static void dryInsert(ContentResolver resolver, ProbeTargets.Target target, List<String> lines) {
    Uri base = Uri.parse(target.uri);
    boolean inserted = false;
    String createdId = null;
    try {
      ContentValues values = new ContentValues();
      for (Map.Entry<String, Object> column : target.row().entrySet()) {
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
      inserted = ResolverTable.wroteRow(created);
      createdId = inserted ? ResolverTable.rowId(created) : null;
      emit(lines, ProbeFormat.ok(target.label, "insert", inserted ? "row created" : "no row (refused: " + created + ")"));
    } catch (Throwable error) {
      emit(lines, ProbeFormat.failed(target.label, "insert", error));
    }
    revert(resolver, target, base, createdId, inserted, lines);
  }

  /** Removes, or for the Calendar cancels, the new row and every older marked one ({@link ProbeRevert}). */
  private static void revert(
      ContentResolver resolver, ProbeTargets.Target target, Uri base, String createdId, boolean inserted, List<String> lines) {
    List<String> revert = new ArrayList<>();
    ProbeRevert.revert(
        target.cancelsOnRevert()
            ? ResolverTable.cancelling(
                resolver,
                base,
                ProbeTargets.ROW_ID,
                target.markerColumn,
                ProbeTargets.MARKER,
                ProbeTargets.STATUS_COLUMN,
                ProbeTargets.CANCELLED_STATUS,
                ProbeTargets.MODIFIED_COLUMN)
            : new ResolverTable(resolver, base, ProbeTargets.ROW_ID, target.markerColumn, ProbeTargets.MARKER),
        target.label,
        target.markerColumn,
        createdId,
        inserted,
        revert);
    for (String line : revert) {
      emit(lines, line);
    }
  }
}
