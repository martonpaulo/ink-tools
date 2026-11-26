package com.martonpaulo.inktools.bridge;

import java.util.List;
import java.util.Map;

/**
 * The four PluginHost calls on the wire (#215): the transaction codes and the argument order of
 * PluginHost's {@code IPluginSetting}, as PluginHost 1.00.2610150 declares them. Every vendor name
 * and number comes from the registry (items pluginhost.setting-service and pluginhost.call-numbers,
 * #294). No Android import, so the JVM tests check the encoding through {@link Wire}.
 *
 * <p>The encoding is the one AIDL writes: the interface token first, a non-null parcelable as the
 * int 1 then its body, a typed list as its size then each element the same way, a callback as a
 * strong binder. The body of a parcelable is written by PluginHost's own class (see
 * {@code HostClasses}), so its field order never has to be copied here.
 */
public final class HostCalls {
  /** The binder descriptor; it must match PluginHost's exactly, or every call is refused. */
  public static final String DESCRIPTOR = Registry.PluginhostSettingService.DESCRIPTOR;
  /**
   * The callbacks live in the {@code .callback} subpackage, unlike {@code IPluginSetting}: a stub
   * under any other descriptor fails {@code enforceInterface} and PluginHost's answer is lost
   * (device log, #215).
   */
  public static final String CALLBACK_PACKAGE = Registry.PluginhostSettingService.CALLBACK_PACKAGE;
  public static final String INSTALL_CALLBACK = CALLBACK_PACKAGE + Registry.PluginhostSettingService.INSTALL_CALLBACK;
  public static final String SET_CALLBACK = CALLBACK_PACKAGE + Registry.PluginhostSettingService.SET_CALLBACK;
  public static final String UNINSTALL_CALLBACK = CALLBACK_PACKAGE + Registry.PluginhostSettingService.UNINSTALL_CALLBACK;
  public static final String HOST_PACKAGE = Registry.PluginhostSettingService.HOST_PACKAGE;
  public static final String SERVICE = Registry.PluginhostSettingService.SERVICE;

  /** android.os.IBinder.FIRST_CALL_TRANSACTION, so method n of the interface is n. */
  public static final int INSTALL = Registry.PluginhostCallNumbers.INSTALL;
  public static final int UNINSTALL = Registry.PluginhostCallNumbers.UNINSTALL;
  public static final int SET_ENABLE = Registry.PluginhostCallNumbers.SET_ENABLE;
  public static final int UPDATE_PERMISSIONS = Registry.PluginhostCallNumbers.UPDATE_PERMISSIONS;

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

  /** The method a call number stands for, as the registry names it; null for another number. */
  public static String methodOf(int code) {
    switch (code) {
      case INSTALL:
        return Registry.PluginhostCallNumbers.INSTALL_METHOD;
      case UNINSTALL:
        return Registry.PluginhostCallNumbers.UNINSTALL_METHOD;
      case SET_ENABLE:
        return Registry.PluginhostCallNumbers.SET_ENABLE_METHOD;
      case UPDATE_PERMISSIONS:
        return Registry.PluginhostCallNumbers.UPDATE_PERMISSIONS_METHOD;
      default:
        return null;
    }
  }

  /**
   * Null when PluginHost's own {@code IPluginSetting$Stub} gives {@code code} to the method the
   * registry names for it; else why the call is refused (#294, #293). The numbers come from
   * device data, not an official API: a reordered interface would run another method under the same number, and 5
   * is uninstall, so no call goes out unchecked. A Stub without the constant is refused too: no
   * fallback for a Supernote internal.
   *
   * @param stub the Stub's {@code TRANSACTION_<method>} constants, by method name
   */
  public static String refusal(Map<String, Integer> stub, int code) {
    String method = methodOf(code);
    if (method == null) {
      return "call " + code + " names no method in the registry; refused";
    }
    Integer actual = stub.get(method);
    if (actual == null) {
      return DESCRIPTOR + "$Stub has no TRANSACTION_" + method + ", so call " + code + " cannot be checked; refused";
    }
    if (actual != code) {
      return DESCRIPTOR + "$Stub numbers " + method + " " + actual + ", not " + code
          + ": PluginHost's interface changed; refused";
    }
    return null;
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
