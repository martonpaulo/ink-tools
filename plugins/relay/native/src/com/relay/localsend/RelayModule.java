package com.relay.localsend;

import android.content.Context;
import android.net.wifi.WifiManager;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import java.io.File;
import java.net.SocketTimeoutException;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The network half of Relay (#98), as `NativeModules.RelayLocalSend`: discovery, one POST, a
 * file's size and hash, the removal of a temporary PNG, and the small settings file, since
 * sn-plugin-lib 0.2.3 has no file writer. Every call runs off the JS thread and
 * rejects with a text code (`IDENTITY`, `TIMEOUT`, `IO`) that sn-adapter keeps as `moduleCode`.
 * Never logs a body, a token or a session id.
 */
public final class RelayModule extends ReactContextBaseJavaModule {
  private static final Charset UTF_8 = Charset.forName("UTF-8");
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  public RelayModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "RelayLocalSend";
  }

  @Override
  public void invalidate() {
    worker.shutdownNow();
    super.invalidate();
  }

  /** Resolves with `[{ip, text}]`, every answer to one announce within `timeoutMs`. */
  @ReactMethod
  public void discover(
      final String group,
      final double port,
      final String announce,
      final double timeoutMs,
      final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            WifiManager wifi =
                (WifiManager)
                    getReactApplicationContext()
                        .getApplicationContext()
                        .getSystemService(Context.WIFI_SERVICE);
            // Android drops multicast to the app unless a lock is held.
            WifiManager.MulticastLock lock = wifi == null ? null : wifi.createMulticastLock("relay");
            try {
              if (lock != null) {
                lock.setReferenceCounted(false);
                lock.acquire();
              }
              List<Discovery.Answer> answers =
                  Discovery.run(group, (int) port, announce, (int) timeoutMs);
              WritableArray out = Arguments.createArray();
              for (Discovery.Answer answer : answers) {
                WritableMap item = Arguments.createMap();
                item.putString("ip", answer.ip);
                item.putString("text", answer.text);
                out.pushMap(item);
              }
              promise.resolve(out);
            } catch (Throwable error) {
              reject(promise, error);
            } finally {
              if (lock != null && lock.isHeld()) {
                lock.release();
              }
            }
          }
        });
  }

  /**
   * One POST: `body` as UTF-8 text, or the bytes of `filePath` when `body` is null. Resolves with
   * `{status, body}`.
   */
  @ReactMethod
  public void post(
      final String url,
      final ReadableMap headers,
      final String body,
      final String filePath,
      final String pinned,
      final double connectMs,
      final double readMs,
      final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              Map<String, String> plain = new HashMap<>();
              ReadableMapKeySetIterator keys = headers.keySetIterator();
              while (keys.hasNextKey()) {
                String key = keys.nextKey();
                plain.put(key, headers.getString(key));
              }
              PinnedClient.Response response =
                  PinnedClient.post(
                      url,
                      plain,
                      body == null ? null : body.getBytes(UTF_8),
                      body == null ? new File(filePath) : null,
                      pinned,
                      (int) connectMs,
                      (int) readMs);
              WritableMap out = Arguments.createMap();
              out.putInt("status", response.status);
              out.putString("body", response.body);
              promise.resolve(out);
            } catch (Throwable error) {
              reject(promise, error);
            }
          }
        });
  }

  /** Resolves with `{size, sha256}` for the prepare-upload offer. */
  @ReactMethod
  public void fileInfo(final String path, final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              File file = new File(path);
              WritableMap out = Arguments.createMap();
              out.putDouble("size", file.length());
              out.putString("sha256", PinnedClient.sha256Hex(file));
              promise.resolve(out);
            } catch (Throwable error) {
              reject(promise, error);
            }
          }
        });
  }

  /** Removes a temporary PNG; resolves `true` when it is gone, also when it never existed. */
  @ReactMethod
  public void remove(final String path, final Promise promise) {
    File file = new File(path);
    promise.resolve(!file.exists() || file.delete());
  }

  /** Resolves with the file's UTF-8 text, or null when it does not exist. */
  @ReactMethod
  public void readText(final String path, final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              promise.resolve(TextFiles.read(new File(path)));
            } catch (Throwable error) {
              reject(promise, error);
            }
          }
        });
  }

  /** Replaces the file with `text` in one rename, making its folder when needed. */
  @ReactMethod
  public void writeText(final String path, final String text, final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              TextFiles.write(new File(path), text);
              promise.resolve(null);
            } catch (Throwable error) {
              reject(promise, error);
            }
          }
        });
  }

  private static void reject(Promise promise, Throwable error) {
    String code =
        PinnedClient.identityChanged(error)
            ? "IDENTITY"
            : error instanceof SocketTimeoutException ? "TIMEOUT" : "IO";
    promise.reject(code, error.getClass().getSimpleName());
  }
}
