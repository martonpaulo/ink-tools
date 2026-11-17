package com.martonpaulo.inktools.bridge;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

/**
 * Sets and reads the fields of PluginHost's parcelables by name (#215). Their classes load from
 * PluginHost's own APK at run time, so the bridge never copies their layout; it only names the
 * fields #215 documents: PluginInfo {@code pluginID} and {@code enable}, PluginPermission
 * {@code name} and {@code status}. No Android import, so the JVM tests cover it.
 */
public final class Fields {
  private Fields() {}

  /** A setter first ({@code setEnable}), then the declared field in the class or a parent. */
  public static void set(Object target, String name, Object value) {
    String setter = "set" + Character.toUpperCase(name.charAt(0)) + name.substring(1);
    for (Method method : target.getClass().getMethods()) {
      if (method.getName().equals(setter) && method.getParameterTypes().length == 1
          && accepts(method.getParameterTypes()[0], value)) {
        try {
          method.invoke(target, value);
          return;
        } catch (ReflectiveOperationException error) {
          throw new IllegalStateException(setter + " failed: " + error, error);
        }
      }
    }
    Field field = field(target.getClass(), name);
    if (field == null || !accepts(field.getType(), value)) {
      throw new IllegalStateException(target.getClass().getName() + " has no field " + name + " for " + value);
    }
    try {
      field.setAccessible(true);
      field.set(target, value);
    } catch (ReflectiveOperationException error) {
      throw new IllegalStateException("cannot set " + name + ": " + error, error);
    }
  }

  /** Every instance field as name=value, for a log line and the shell; never throws. */
  public static String describe(Object value) {
    if (value == null) {
      return "null";
    }
    StringBuilder text = new StringBuilder(value.getClass().getSimpleName()).append('{');
    String separator = "";
    for (Class<?> type = value.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {
      for (Field field : type.getDeclaredFields()) {
        if (Modifier.isStatic(field.getModifiers())) {
          continue;
        }
        Object shown;
        try {
          field.setAccessible(true);
          shown = field.get(value);
        } catch (ReflectiveOperationException | RuntimeException error) {
          shown = "?";
        }
        text.append(separator).append(field.getName()).append('=').append(shown);
        separator = ", ";
      }
    }
    return text.append('}').toString();
  }

  private static Field field(Class<?> type, String name) {
    for (Class<?> current = type; current != null; current = current.getSuperclass()) {
      try {
        return current.getDeclaredField(name);
      } catch (NoSuchFieldException ignored) {
        // look in the parent
      }
    }
    return null;
  }

  private static boolean accepts(Class<?> type, Object value) {
    if (type == boolean.class) {
      return value instanceof Boolean;
    }
    if (type == int.class) {
      return value instanceof Integer;
    }
    return value == null || type.isInstance(value);
  }
}
