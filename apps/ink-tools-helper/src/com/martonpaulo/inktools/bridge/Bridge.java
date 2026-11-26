package com.martonpaulo.inktools.bridge;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.Parcel;
import android.os.Parcelable;
import android.os.RemoteException;
import android.util.Log;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Runs one {@link Command} against PluginHost's PluginSettingService (#215): binds it, writes the
 * call with {@link HostCalls}, and waits for the callback. Runs on a worker thread, never the main
 * one, since every wait here blocks.
 */
final class Bridge {
  static final String TAG = "InkToolsBridge";
  /** Under the 60 s a background broadcast may take before Android reports it as not answering. */
  private static final long CALLBACK_SECONDS = 50;
  private static final long BIND_SECONDS = 10;
  /** The registry item a refused call number belongs to (#294). */
  private static final String CALL_NUMBERS_ITEM = "pluginhost.call-numbers";

  private final Context context;

  Bridge(Context context) {
    this.context = context;
  }

  Outcome run(Command command) {
    if (command.op == Command.Op.PING) {
      try {
        return Outcome.of(Outcome.OK, "bridge " + context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
      } catch (android.content.pm.PackageManager.NameNotFoundException error) {
        return Outcome.of(Outcome.FAILED, error.toString());
      }
    }
    // Before acting, the kill switch (#293): a module turned off in the registry stops and says so.
    Registry.Item off = HostCalls.turnedOff(Registry.ITEMS);
    if (off != null) {
      InternalFailure failure = new InternalFailure(off.id, command.op.name().toLowerCase(java.util.Locale.ROOT), Copy.TURNED_OFF,
          Build.FINGERPRINT, hostVersions(), new IllegalStateException(off.id + " is turned off " + off.off));
      Log.w(TAG, "call op=" + command.op + " " + failure.agentLog());
      return Outcome.of(Outcome.FAILED, failure.userSentence(Copy.FAILURES));
    }
    HostClasses classes;
    try {
      classes = HostClasses.load(context);
    } catch (Exception error) {
      return Outcome.of(Outcome.UNREACHABLE, "PluginHost classes not loaded: " + error);
    }
    Connection connection = new Connection();
    Intent intent = new Intent(HostCalls.DESCRIPTOR).setComponent(new ComponentName(HostCalls.HOST_PACKAGE, HostCalls.SERVICE));
    if (!context.bindService(intent, connection, Context.BIND_AUTO_CREATE)) {
      return Outcome.of(Outcome.UNREACHABLE, "bindService refused " + HostCalls.SERVICE);
    }
    try {
      IBinder service = connection.await();
      if (service == null) {
        return Outcome.of(Outcome.UNREACHABLE, HostCalls.SERVICE + " did not connect in " + BIND_SECONDS + " s");
      }
      return call(service, classes, command);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      return Outcome.of(Outcome.FAILED, "interrupted");
    } finally {
      context.unbindService(connection);
    }
  }

  private Outcome call(IBinder service, HostClasses classes, Command command) throws InterruptedException {
    Parcel data = Parcel.obtain();
    Parcel reply = Parcel.obtain();
    try {
      ParcelWire wire = new ParcelWire(data);
      Callback callback = null;
      int code;
      switch (command.op) {
        case INSTALL:
          callback = new Callback(HostCalls.INSTALL_CALLBACK, classes);
          code = HostCalls.install(wire, command.path, callback);
          break;
        case ENABLE:
        case DISABLE:
          callback = new Callback(HostCalls.SET_CALLBACK, classes);
          code = HostCalls.setEnable(wire, classes.pluginInfo(command.pluginId, command.op == Command.Op.ENABLE), callback);
          break;
        case UNINSTALL:
          callback = new Callback(HostCalls.UNINSTALL_CALLBACK, classes);
          code = HostCalls.uninstall(wire, classes.pluginInfo(command.pluginId, false), callback);
          break;
        case ALLOW:
          List<Object> permissions = new ArrayList<>();
          for (String name : command.permissions) {
            permissions.add(classes.permission(name, command.status));
          }
          code = HostCalls.updatePermissions(wire, command.pluginId, permissions);
          break;
        default:
          return Outcome.of(Outcome.USAGE, "no call for " + command.op);
      }
      String refused = HostCalls.refusal(transactions(classes.loader, HostCalls.DESCRIPTOR), code);
      if (refused != null) {
        InternalFailure failure = new InternalFailure(
            CALL_NUMBERS_ITEM, command.op.name().toLowerCase(java.util.Locale.ROOT), Copy.HOST_CHANGED,
            Build.FINGERPRINT, hostVersions(), new IllegalStateException(refused));
        Log.w(TAG, "call op=" + command.op + " " + failure.agentLog());
        return Outcome.of(Outcome.FAILED, failure.userSentence(Copy.FAILURES));
      }
      Log.i(TAG, "call op=" + command.op + " code=" + code);
      service.transact(code, data, reply, 0);
      reply.readException();
      if (callback == null) {
        return Outcome.of(Outcome.OK, command.op.name().toLowerCase(java.util.Locale.ROOT) + " " + command.pluginId);
      }
      return callback.await();
    } catch (RemoteException | RuntimeException | ReflectiveOperationException error) {
      Log.w(TAG, "call failed", error);
      return Outcome.of(Outcome.FAILED, error.toString());
    } finally {
      data.recycle();
      reply.recycle();
    }
  }

  /** PluginHost's version name, for a failure's log (#294); {@link InternalFailure#UNREAD} when it cannot be read. */
  private Map<String, String> hostVersions() {
    Map<String, String> apps = new HashMap<>();
    try {
      apps.put(HostCalls.HOST_PACKAGE, context.getPackageManager().getPackageInfo(HostCalls.HOST_PACKAGE, 0).versionName);
    } catch (android.content.pm.PackageManager.NameNotFoundException error) {
      apps.put(HostCalls.HOST_PACKAGE, InternalFailure.UNREAD);
    }
    return apps;
  }

  /** The service binder, handed over from the main thread. */
  private static final class Connection implements ServiceConnection {
    private final CountDownLatch connected = new CountDownLatch(1);
    private volatile IBinder service;

    @Override
    public void onServiceConnected(ComponentName name, IBinder binder) {
      service = binder;
      connected.countDown();
    }

    @Override
    public void onServiceDisconnected(ComponentName name) {
      service = null;
    }

    IBinder await() throws InterruptedException {
      connected.await(BIND_SECONDS, TimeUnit.SECONDS);
      return service;
    }
  }

  /**
   * A callback binder under PluginHost's descriptor. PluginHost links a death recipient to it and
   * reports through it, which is why a live process must hold it (#215).
   */
  private static final class Callback extends Binder {
    private final String descriptor;
    private final HostClasses classes;
    private final Map<String, Integer> transactions;
    private final CountDownLatch answered = new CountDownLatch(1);
    private volatile Outcome outcome;

    Callback(String descriptor, HostClasses classes) {
      this.descriptor = descriptor;
      this.classes = classes;
      this.transactions = transactions(classes.loader, descriptor);
      attachInterface(null, descriptor);
    }

    @Override
    protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
      if (code == INTERFACE_TRANSACTION) {
        reply.writeString(descriptor);
        return true;
      }
      if (code < FIRST_CALL_TRANSACTION || code > LAST_CALL_TRANSACTION) {
        return false;
      }
      data.enforceInterface(descriptor);
      String method = Callbacks.method(transactions, code);
      String arguments = method == null ? "" : classes.readArguments(descriptor, method, data);
      boolean ok = Callbacks.succeeded(method, code);
      Log.i(TAG, "callback " + (method == null ? "code " + code : method) + "(" + arguments + ")");
      outcome = Outcome.of(ok ? Outcome.OK : Outcome.FAILED, (method == null ? "code " + code : method) + " " + arguments);
      if (reply != null) {
        reply.writeNoException();
      }
      answered.countDown();
      return true;
    }

    Outcome await() throws InterruptedException {
      if (!answered.await(CALLBACK_SECONDS, TimeUnit.SECONDS)) {
        return Outcome.of(Outcome.TIMEOUT, "no callback from PluginHost in " + CALLBACK_SECONDS + " s");
      }
      return outcome;
    }

  }

  /** The Stub's TRANSACTION_<method> constants; empty when PluginHost's Stub has none. */
  static Map<String, Integer> transactions(ClassLoader loader, String descriptor) {
    Map<String, Integer> found = new HashMap<>();
    try {
      for (Field field : loader.loadClass(descriptor + "$Stub").getDeclaredFields()) {
        if (Modifier.isStatic(field.getModifiers()) && field.getType() == int.class
            && field.getName().startsWith("TRANSACTION_")) {
          field.setAccessible(true);
          found.put(field.getName().substring("TRANSACTION_".length()), field.getInt(null));
        }
      }
    } catch (ReflectiveOperationException | RuntimeException error) {
      Log.w(TAG, "no Stub constants for " + descriptor + ": " + error);
    }
    return found;
  }

  /** {@link HostCalls.Wire} over a real Parcel. */
  private static final class ParcelWire implements HostCalls.Wire {
    private final Parcel parcel;

    ParcelWire(Parcel parcel) {
      this.parcel = parcel;
    }

    @Override
    public void writeInterfaceToken(String descriptor) {
      parcel.writeInterfaceToken(descriptor);
    }

    @Override
    public void writeString(String value) {
      parcel.writeString(value);
    }

    @Override
    public void writeInt(int value) {
      parcel.writeInt(value);
    }

    @Override
    public void writeStrongBinder(Object binder) {
      parcel.writeStrongBinder((IBinder) binder);
    }

    @Override
    public void writeBody(Object parcelable) {
      ((Parcelable) parcelable).writeToParcel(parcel, 0);
    }
  }
}
