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
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.SocketTimeoutException;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * The network half of Relay (#98), as `NativeModules.RelayLocalSend`: discovery, one POST, a
 * file's size and hash, the removal of a temporary PNG, and the small settings file, since
 * sn-plugin-lib 0.2.3 has no file writer. The receive half (#49): our v3 identity, the receiver,
 * and a queue of what arrives, which JS reads one item at a time and answers each offer of. Every call runs off the JS thread and
 * rejects with a text code (`IDENTITY`, `TIMEOUT`, `IO`) that sn-adapter keeps as `moduleCode`.
 * Never logs a body, a token or a session id.
 */
public final class RelayModule extends ReactContextBaseJavaModule {
  private static final Charset UTF_8 = Charset.forName("UTF-8");
  /** How long the receiver waits for JS to decide an offer before it answers 500. */
  private static final long DECIDE_MS = 10000;

  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final LinkedBlockingQueue<WritableMap> arrivals = new LinkedBlockingQueue<>();
  private final LinkedBlockingQueue<Receiver.Decision> decisions = new LinkedBlockingQueue<>();
  private Receiver receiver;
  private MulticastSocket multicast;
  private WifiManager.MulticastLock multicastLock;

  public RelayModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "RelayLocalSend";
  }

  @Override
  public void invalidate() {
    closeReceiver();
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

  /** Resolves with our fingerprint, making the identity in `folder` when needed. */
  @ReactMethod
  public void identity(final String folder, final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              promise.resolve(Identity.load(new File(folder)).fingerprint);
            } catch (Throwable error) {
              reject(promise, error);
            }
          }
        });
  }

  /**
   * Starts the receiver on `port` and the multicast answer; resolves with our fingerprint.
   * `info` answers `/info` and `/register`; `announce` and `answer` are the multicast texts.
   */
  @ReactMethod
  public void startReceive(
      final String identityFolder,
      final String fileFolder,
      final double port,
      final String group,
      final String info,
      final String announce,
      final String answer,
      final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              closeReceiver();
              arrivals.clear();
              decisions.clear();
              Identity identity = Identity.load(new File(identityFolder));
              receiver =
                  new Receiver(
                      Receiver.tlsSocket(identity, null, (int) port),
                      info,
                      new File(fileFolder),
                      new Receiver.Decider() {
                        @Override
                        public Receiver.Decision decide(String body, String sessionId, String token)
                            throws Exception {
                          WritableMap offer = Arguments.createMap();
                          offer.putString("kind", "offer");
                          offer.putString("body", body);
                          offer.putString("sessionId", sessionId);
                          offer.putString("token", token);
                          arrivals.add(offer);
                          Receiver.Decision decision =
                              decisions.poll(DECIDE_MS, TimeUnit.MILLISECONDS);
                          if (decision == null) {
                            throw new SocketTimeoutException("no decision");
                          }
                          return decision;
                        }
                      },
                      new Receiver.Sink() {
                        @Override
                        public void received(String path) {
                          WritableMap file = Arguments.createMap();
                          file.putString("kind", "file");
                          file.putString("path", path);
                          arrivals.add(file);
                        }

                        @Override
                        public void cancelled() {
                          WritableMap cancel = Arguments.createMap();
                          cancel.putString("kind", "cancel");
                          arrivals.add(cancel);
                        }
                      });
              startMulticast(group, (int) port, announce, answer, identity.fingerprint);
              promise.resolve(identity.fingerprint);
            } catch (Throwable error) {
              closeReceiver();
              reject(promise, error);
            }
          }
        });
  }

  /** Resolves with the next arrival (`offer`, `file`, `cancel`, `stopped`), or null at the timeout. */
  @ReactMethod
  public void nextReceived(final double timeoutMs, final Promise promise) {
    // Its own thread: the worker must stay free for `answer`.
    new Thread(
            new Runnable() {
              @Override
              public void run() {
                try {
                  promise.resolve(arrivals.poll((long) timeoutMs, TimeUnit.MILLISECONDS));
                } catch (Throwable error) {
                  reject(promise, error);
                }
              }
            },
            "relay-next")
        .start();
  }

  /** The decision on the last offer; `fileId` null when no upload follows. */
  @ReactMethod
  public void answer(
      final double status,
      final String body,
      final String fileId,
      final String extension,
      final Promise promise) {
    decisions.add(new Receiver.Decision((int) status, body, fileId, extension));
    promise.resolve(true);
  }

  /** Stops receiving; a waiting `nextReceived` resolves with `stopped`. */
  @ReactMethod
  public void stopReceive(final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            closeReceiver();
            WritableMap stopped = Arguments.createMap();
            stopped.putString("kind", "stopped");
            arrivals.add(stopped);
            promise.resolve(true);
          }
        });
  }

  private void startMulticast(
      String group, final int port, final String announce, final String answer,
      final String fingerprint) throws java.io.IOException {
    WifiManager wifi =
        (WifiManager)
            getReactApplicationContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    if (wifi != null) {
      multicastLock = wifi.createMulticastLock("relay-receive");
      multicastLock.setReferenceCounted(false);
      multicastLock.acquire();
    }
    final InetAddress address = InetAddress.getByName(group);
    final MulticastSocket socket = new MulticastSocket(port);
    socket.joinGroup(address);
    multicast = socket;
    new Thread(
            new Runnable() {
              @Override
              public void run() {
                try {
                  Discovery.answer(socket, address, port, announce, answer, fingerprint);
                } catch (Throwable ignored) {
                  // Without multicast a sender still reaches us by `/register` or by address.
                }
              }
            },
            "relay-multicast")
        .start();
  }

  private void closeReceiver() {
    if (receiver != null) {
      receiver.close();
      receiver = null;
    }
    if (multicast != null) {
      multicast.close();
      multicast = null;
    }
    if (multicastLock != null && multicastLock.isHeld()) {
      multicastLock.release();
    }
    multicastLock = null;
  }

  private static void reject(Promise promise, Throwable error) {
    String code =
        PinnedClient.identityChanged(error)
            ? "IDENTITY"
            : error instanceof SocketTimeoutException ? "TIMEOUT" : "IO";
    promise.reject(code, error.getClass().getSimpleName());
  }
}
