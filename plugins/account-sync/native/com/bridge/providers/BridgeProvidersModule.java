package com.bridge.providers;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.inktools.provider.ResolverTable;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The device half of sn-adapter's `DeviceReader` (#43): one unfiltered query for a table's columns,
 * and the probe's test write, which is {@link #update} selected by a row id no row has. There is no
 * test insert: the Calendar provider never deletes a row, so a test row would stay (#43). It names no
 * provider: every URI and column comes from sn-adapter's descriptor through the JavaScript caller,
 * so a changed provider is a descriptor update, never a native build.
 *
 * <p>It is also the native writer of Account Sync's `ContentRows` (#28, #44, src/deviceRows.ts):
 * query, insert, update and delete, each filter a plain column equality the JavaScript side builds.
 * Every value crosses as text, a number or null; a provider that refuses a write rejects, and an
 * insert the provider ignored is a rejection, never an id.
 *
 * <p>{@link #watch} observes the URIs it is given, the Calendar's and the To-Do's (#296), and emits
 * one {@link #CHANGED_EVENT} per debounced burst of tablet edits, which `src/providerWatch.ts` turns
 * into a sync beside the timer. Every write here marks the {@link ChangeGate}, so our own rows do not
 * start a sync again.
 */
public final class BridgeProvidersModule extends ReactContextBaseJavaModule {
  /** The event the JavaScript side listens for; it carries no data. */
  static final String CHANGED_EVENT = "BridgeProvidersChanged";

  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final List<ContentObserver> observers = new ArrayList<>();
  private ChangeGate gate;

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

  /** The selection of a filter: {@code a = ? AND b IS NULL}; an empty filter selects every row. */
  static String selection(ReadableMap where, List<String> args) {
    StringBuilder out = new StringBuilder();
    ReadableMapKeySetIterator keys = where.keySetIterator();
    while (keys.hasNextKey()) {
      String key = keys.nextKey();
      if (out.length() > 0) {
        out.append(" AND ");
      }
      String value = text(where, key);
      if (value == null) {
        out.append(key).append(" IS NULL");
      } else {
        out.append(key).append(" = ?");
        args.add(value);
      }
    }
    return out.length() == 0 ? null : out.toString();
  }

  /** A filter value as SQLite compares it: a whole number without a fraction, a flag as 1 or 0. */
  private static String text(ReadableMap map, String key) {
    switch (map.getType(key)) {
      case Null:
        return null;
      case Boolean:
        return map.getBoolean(key) ? "1" : "0";
      case Number:
        double n = map.getDouble(key);
        return n == Math.rint(n) && Math.abs(n) < 9.007199254740992E15 ? Long.toString((long) n) : Double.toString(n);
      case String:
        return map.getString(key);
      default:
        throw new IllegalArgumentException("column " + key + " holds a value that is not text, a number or null");
    }
  }

  private static ContentValues values(ReadableMap row) {
    ContentValues values = new ContentValues();
    ReadableMapKeySetIterator keys = row.keySetIterator();
    while (keys.hasNextKey()) {
      String key = keys.nextKey();
      switch (row.getType(key)) {
        case Null:
          values.putNull(key);
          break;
        case Boolean:
          values.put(key, row.getBoolean(key) ? 1 : 0);
          break;
        case Number:
          double n = row.getDouble(key);
          if (n == Math.rint(n) && Math.abs(n) < 9.007199254740992E15) {
            values.put(key, (long) n);
          } else {
            values.put(key, n);
          }
          break;
        case String:
          values.put(key, row.getString(key));
          break;
        default:
          throw new IllegalArgumentException("column " + key + " holds a value that is not text, a number or null");
      }
    }
    return values;
  }

  /** Resolves with every row the filter selects, each column as text, a number or null. */
  @ReactMethod
  public void query(String uri, ReadableMap where, Promise promise) {
    worker.execute(
        () -> {
          ContentResolver resolver = getReactApplicationContext().getContentResolver();
          List<String> args = new ArrayList<>();
          try (Cursor cursor =
              resolver.query(Uri.parse(uri), null, selection(where, args), args.toArray(new String[0]), null)) {
            if (cursor == null) {
              promise.reject("no_provider", "no provider answered " + uri);
              return;
            }
            WritableArray rows = Arguments.createArray();
            String[] names = cursor.getColumnNames();
            while (cursor.moveToNext()) {
              WritableMap row = Arguments.createMap();
              for (int i = 0; i < names.length; i++) {
                switch (cursor.getType(i)) {
                  case Cursor.FIELD_TYPE_INTEGER:
                    row.putDouble(names[i], (double) cursor.getLong(i));
                    break;
                  case Cursor.FIELD_TYPE_FLOAT:
                    row.putDouble(names[i], cursor.getDouble(i));
                    break;
                  case Cursor.FIELD_TYPE_STRING:
                    row.putString(names[i], cursor.getString(i));
                    break;
                  default:
                    // A null, or a blob Account Sync never reads.
                    row.putNull(names[i]);
                }
              }
              rows.pushMap(row);
            }
            promise.resolve(rows);
          } catch (Throwable error) {
            promise.reject("query_failed", String.valueOf(error.getMessage()), error);
          }
        });
  }

  /** Resolves with the new row's id, the last segment of the URI the provider answers. */
  @ReactMethod
  public void insert(String uri, ReadableMap row, Promise promise) {
    worker.execute(
        () -> {
          try {
            markOwnWrite();
            Uri created = getReactApplicationContext().getContentResolver().insert(Uri.parse(uri), values(row));
            markOwnWrite();
            // A refused row is a null answer or an id below 0 (#63), as InsertAnswer decides (#217).
            if (!ResolverTable.wroteRow(created)) {
              promise.reject("insert_refused", "the provider refused the row: " + created);
            } else {
              promise.resolve(created.getLastPathSegment());
            }
          } catch (Throwable error) {
            promise.reject("insert_refused", String.valueOf(error.getMessage()), error);
          }
        });
  }

  /** Resolves with the number of rows changed. */
  @ReactMethod
  public void update(String uri, ReadableMap where, ReadableMap row, Promise promise) {
    worker.execute(
        () -> {
          try {
            List<String> args = new ArrayList<>();
            String selection = selection(where, args);
            markOwnWrite();
            int changed =
                getReactApplicationContext()
                    .getContentResolver()
                    .update(Uri.parse(uri), values(row), selection, args.toArray(new String[0]));
            markOwnWrite();
            promise.resolve(changed);
          } catch (Throwable error) {
            promise.reject("update_refused", String.valueOf(error.getMessage()), error);
          }
        });
  }

  /** Resolves with the number of rows deleted; an empty filter is refused, never a delete of all. */
  @ReactMethod
  public void remove(String uri, ReadableMap where, Promise promise) {
    worker.execute(
        () -> {
          try {
            List<String> args = new ArrayList<>();
            String selection = selection(where, args);
            if (selection == null) {
              promise.reject("delete_refused", "a delete needs a filter");
              return;
            }
            markOwnWrite();
            int removed =
                getReactApplicationContext()
                    .getContentResolver()
                    .delete(Uri.parse(uri), selection, args.toArray(new String[0]));
            markOwnWrite();
            promise.resolve(removed);
          } catch (Throwable error) {
            promise.reject("delete_refused", String.valueOf(error.getMessage()), error);
          }
        });
  }

  private synchronized void markOwnWrite() {
    if (gate != null) {
      gate.ownWrite(SystemClock.uptimeMillis());
    }
  }

  /**
   * Observes each URI and its descendants; a debounced burst of changes emits {@link
   * #CHANGED_EVENT} once. A second call replaces the first. Resolves with the number of URIs
   * observed; rejects when the provider refuses the observer.
   */
  @ReactMethod
  public void watch(ReadableArray uris, double debounceMs, Promise promise) {
    handler.post(
        () -> {
          try {
            stopObservers();
            ChangeGate next = new ChangeGate((long) debounceMs);
            synchronized (this) {
              gate = next;
            }
            ContentResolver resolver = getReactApplicationContext().getContentResolver();
            for (int i = 0; i < uris.size(); i++) {
              ContentObserver observer =
                  new ContentObserver(handler) {
                    @Override
                    public void onChange(boolean selfChange) {
                      changed(next);
                    }
                  };
              resolver.registerContentObserver(Uri.parse(uris.getString(i)), true, observer);
              observers.add(observer);
            }
            promise.resolve(observers.size());
          } catch (Throwable error) {
            stopObservers();
            promise.reject("watch_refused", String.valueOf(error.getMessage()), error);
          }
        });
  }

  /** On the handler thread: a change asks the gate, and the gate is asked again at its deadline. */
  private void changed(ChangeGate current) {
    long at = current.change(SystemClock.uptimeMillis());
    if (at < 0) {
      return;
    }
    handler.postAtTime(
        () -> {
          if (current.due(SystemClock.uptimeMillis())) {
            getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(CHANGED_EVENT, null);
          }
        },
        at);
  }

  private void stopObservers() {
    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    for (ContentObserver observer : observers) {
      resolver.unregisterContentObserver(observer);
    }
    observers.clear();
  }

  /** NativeEventEmitter's bookkeeping calls; the module emits whether or not they ran. */
  @ReactMethod
  public void addListener(String eventName) {}

  @ReactMethod
  public void removeListeners(double count) {}

  @Override
  public void invalidate() {
    handler.post(this::stopObservers);
    worker.shutdownNow();
    super.invalidate();
  }
}
