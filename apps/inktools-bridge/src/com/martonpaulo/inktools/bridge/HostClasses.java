package com.martonpaulo.inktools.bridge;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Parcel;
import android.os.Parcelable;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;

/**
 * PluginHost's own parcelable classes, loaded from its APK (#215). The bridge builds a PluginInfo
 * or a PluginPermission with them and lets their writeToParcel write the body, so the field order
 * stays PluginHost's. The classes are found from the IPluginSetting method signatures, never by a
 * guessed package name.
 */
final class HostClasses {
  final ClassLoader loader;
  final Class<?> pluginInfo;
  final Class<?> pluginPermission;

  private HostClasses(ClassLoader loader, Class<?> pluginInfo, Class<?> pluginPermission) {
    this.loader = loader;
    this.pluginInfo = pluginInfo;
    this.pluginPermission = pluginPermission;
  }

  static HostClasses load(Context context) throws PackageManager.NameNotFoundException, ReflectiveOperationException {
    Context host = context.createPackageContext(
        HostCalls.HOST_PACKAGE, Context.CONTEXT_INCLUDE_CODE | Context.CONTEXT_IGNORE_SECURITY);
    ClassLoader loader = host.getClassLoader();
    Class<?> setting = loader.loadClass(HostCalls.DESCRIPTOR);
    Class<?> info = null;
    Class<?> permission = null;
    for (Method method : setting.getMethods()) {
      if (method.getName().equals("setPluginEnable")) {
        info = method.getParameterTypes()[0];
      } else if (method.getName().equals("updatePluginPermissions")) {
        Type list = method.getGenericParameterTypes()[1];
        if (list instanceof ParameterizedType) {
          permission = (Class<?>) ((ParameterizedType) list).getActualTypeArguments()[0];
        }
      }
    }
    if (info == null || permission == null) {
      throw new ClassNotFoundException(HostCalls.DESCRIPTOR + " lacks setPluginEnable or updatePluginPermissions");
    }
    return new HostClasses(loader, info, permission);
  }

  /** A PluginInfo with only the two fields setPluginEnable and uninstallPlugin read. */
  Object pluginInfo(String pluginId, boolean enable) throws ReflectiveOperationException {
    Object value = pluginInfo.getDeclaredConstructor().newInstance();
    Fields.set(value, "pluginID", pluginId);
    Fields.set(value, "enable", enable);
    return value;
  }

  Object permission(String name, int status) throws ReflectiveOperationException {
    Object value = pluginPermission.getDeclaredConstructor().newInstance();
    Fields.set(value, "name", name);
    Fields.set(value, "status", status);
    return value;
  }

  /**
   * A callback's arguments, read with the types its own interface declares, as text. The callback
   * interface loads from PluginHost by its descriptor; an argument the bridge cannot read ends the
   * text, since every later one would be misread.
   */
  String readArguments(String descriptor, String method, Parcel data) {
    Class<?>[] types;
    try {
      types = find(loader.loadClass(descriptor), method).getParameterTypes();
    } catch (ReflectiveOperationException error) {
      return "(arguments not read: " + error + ")";
    }
    StringBuilder text = new StringBuilder();
    for (Class<?> type : types) {
      if (text.length() > 0) {
        text.append(", ");
      }
      if (type == String.class) {
        text.append(data.readString());
      } else if (type == int.class) {
        text.append(data.readInt());
      } else if (type == boolean.class) {
        text.append(data.readInt() != 0);
      } else if (Parcelable.class.isAssignableFrom(type)) {
        text.append(data.readInt() == 0 ? "null" : Fields.describe(create(type, data)));
      } else {
        return text.append("(").append(type.getSimpleName()).append(" not read)").toString();
      }
    }
    return text.toString();
  }

  private Object create(Class<?> type, Parcel data) {
    try {
      Parcelable.Creator<?> creator = (Parcelable.Creator<?>) type.getField("CREATOR").get(null);
      return creator.createFromParcel(data);
    } catch (ReflectiveOperationException | RuntimeException error) {
      return "(" + type.getSimpleName() + " not read: " + error + ")";
    }
  }

  private static Method find(Class<?> type, String name) throws NoSuchMethodException {
    for (Method method : type.getMethods()) {
      if (method.getName().equals(name)) {
        return method;
      }
    }
    throw new NoSuchMethodException(type.getName() + "." + name);
  }
}
