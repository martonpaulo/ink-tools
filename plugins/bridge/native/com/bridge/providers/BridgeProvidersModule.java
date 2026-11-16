package com.bridge.providers;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The device half of sn-adapter's `DeviceReader` (#43): one unfiltered query for a table's columns,
 * and a marked test row inserted and deleted again, as plugins/probe does (#67). It names no
 * provider: every URI and column comes from sn-adapter's descriptor through the JavaScript caller,
 * so a changed provider is a descriptor update, never a native build.
 */
public final class BridgeProvidersModule extends ReactContextBaseJavaModule {
  /** The text a test row carries; the revert deletes only rows whose marker column equals it. */
  static final String MARKER = "Account Sync dry insert";
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  public BridgeProvidersModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "BridgeProviders";
  }

  /** Resolves with the provider's column names; rejects when it does not answer. */
  @ReactMethod
  public void columnsOf(String uri, Promise promise) {
    worker.execute(
        () -> {
          ContentResolver resolver = getReactApplicationContext().getContentResolver();
          // A limit is not portable across providers, so the query takes no rows it does not need:
          // only the cursor's column names are read, never a row.
          try (Cursor cursor = resolver.query(Uri.parse(uri), null, null, null, null)) {
            if (cursor == null) {
              promise.reject("no_provider", "no provider answered " + uri);
              return;
            }
            WritableArray names = Arguments.createArray();
            for (String name : cursor.getColumnNames()) {
              names.pushString(name);
            }
            promise.resolve(names);
          } catch (Throwable error) {
            promise.reject("query_failed", String.valueOf(error.getMessage()), error);
          }
        });
  }

  /**
   * Inserts one row with {@link #MARKER} in {@code markerColumn}, then deletes every row carrying it.
   * Resolves only when both passed; a row the delete could not remove is named in the rejection.
   */
  @ReactMethod
  public void dryInsert(String uri, String markerColumn, Promise promise) {
    worker.execute(
        () -> {
          ContentResolver resolver = getReactApplicationContext().getContentResolver();
          Uri base = Uri.parse(uri);
          Uri created;
          try {
            ContentValues values = new ContentValues();
            values.put(markerColumn, MARKER);
            created = resolver.insert(base, values);
          } catch (Throwable error) {
            promise.reject("insert_refused", String.valueOf(error.getMessage()), error);
            return;
          }
          try {
            int removed = resolver.delete(base, markerColumn + " = ?", new String[] {MARKER});
            if (created == null) {
              promise.reject("insert_refused", "the provider ignored the test row");
            } else if (removed == 0) {
              promise.reject("revert_failed", "a test row may remain where " + markerColumn + " is '" + MARKER + "'");
            } else {
              promise.resolve(null);
            }
          } catch (Throwable error) {
            promise.reject(
                "revert_failed",
                "a test row may remain where " + markerColumn + " is '" + MARKER + "': " + error.getMessage(),
                error);
          }
        });
  }

  @Override
  public void invalidate() {
    worker.shutdownNow();
    super.invalidate();
  }
}
