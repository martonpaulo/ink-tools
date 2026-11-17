package com.martonpaulo.inktools.bridge;

import java.util.List;

/**
 * The four PluginHost calls on the wire (#215): the transaction codes and the argument order of
 * {@code com.ratta.supernote.plugincorelib.IPluginSetting}, as PluginHost 1.00.2610150 declares
 * them. No Android import, so the JVM tests check the encoding through {@link Wire}.
 *
 * <p>The encoding is the one AIDL writes: the interface token first, a non-null parcelable as the
 * int 1 then its body, a typed list as its size then each element the same way, a callback as a
 * strong binder. The body of a parcelable is written by PluginHost's own class (see
 * {@code HostClasses}), so its field order never has to be copied here.
 */
public final class HostCalls {
  /** The binder descriptor; it must match PluginHost's exactly, or every call is refused. */
  public static final String DESCRIPTOR = "com.ratta.supernote.plugincorelib.IPluginSetting";
  /**
   * The callbacks live in the {@code .callback} subpackage, unlike {@code IPluginSetting}: a stub
   * under any other descriptor fails {@code enforceInterface} and PluginHost's answer is lost
   * (device log, #215).
   */
  public static final String CALLBACK_PACKAGE = "com.ratta.supernote.plugincorelib.callback.";
  public static final String INSTALL_CALLBACK = CALLBACK_PACKAGE + "IPluginInstallCallback";
  public static final String SET_CALLBACK = CALLBACK_PACKAGE + "IPluginSetCallback";
  public static final String UNINSTALL_CALLBACK = CALLBACK_PACKAGE + "IPluginUninstallCallback";
  public static final String HOST_PACKAGE = "com.ratta.supernote.pluginhost";
  public static final String SERVICE = HOST_PACKAGE + ".services.PluginSettingService";

  /** android.os.IBinder.FIRST_CALL_TRANSACTION, so method n of the interface is n. */
  public static final int INSTALL = 1;
  public static final int UNINSTALL = 5;
  public static final int SET_ENABLE = 6;
  public static final int UPDATE_PERMISSIONS = 9;

  /** What a call writes into: android.os.Parcel on the tablet, a recorder in the tests. */
  public interface Wire {
    void writeInterfaceToken(String descriptor);

    void writeString(String value);

    void writeInt(int value);

    void writeStrongBinder(Object binder);

    /** Writes the parcelable's own body, as its writeToParcel(parcel, 0) does. */
    void writeBody(Object parcelable);
  }

  private HostCalls() {}

  /** installPlugin(String path, IPluginInstallCallback cb): installs or upgrades. */
  public static int install(Wire wire, String path, Object callback) {
    wire.writeInterfaceToken(DESCRIPTOR);
    wire.writeString(path);
    wire.writeStrongBinder(callback);
    return INSTALL;
  }

  /** setPluginEnable(PluginInfo plugin, IPluginSetCallback cb): the plugin's enable decides. */
  public static int setEnable(Wire wire, Object pluginInfo, Object callback) {
    wire.writeInterfaceToken(DESCRIPTOR);
    parcelable(wire, pluginInfo);
    wire.writeStrongBinder(callback);
    return SET_ENABLE;
  }

  /** uninstallPlugin(PluginInfo plugin, IPluginUninstallCallback cb). */
  public static int uninstall(Wire wire, Object pluginInfo, Object callback) {
    wire.writeInterfaceToken(DESCRIPTOR);
    parcelable(wire, pluginInfo);
    wire.writeStrongBinder(callback);
    return UNINSTALL;
  }

  /** updatePluginPermissions(String pluginID, List&lt;PluginPermission&gt; perms): returns nothing. */
  public static int updatePermissions(Wire wire, String pluginId, List<?> permissions) {
    wire.writeInterfaceToken(DESCRIPTOR);
    wire.writeString(pluginId);
    wire.writeInt(permissions.size());
    for (Object permission : permissions) {
      parcelable(wire, permission);
    }
    return UPDATE_PERMISSIONS;
  }

  private static void parcelable(Wire wire, Object value) {
    if (value == null) {
      wire.writeInt(0);
      return;
    }
    wire.writeInt(1);
    wire.writeBody(value);
  }
}
