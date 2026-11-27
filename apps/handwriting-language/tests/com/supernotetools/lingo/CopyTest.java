package com.supernotetools.lingo;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;

/** No text of the screen asks for a computer: no `adb` in any copy (#494). Run by `node scripts/build.cjs --test`. */
public final class CopyTest {
  public static void main(String[] args) throws IllegalAccessException {
    int texts = 0;
    for (Field field : Copy.class.getDeclaredFields()) {
      if (Modifier.isStatic(field.getModifiers()) && field.getType() == String.class) {
        field.setAccessible(true);
        String text = (String) field.get(null);
        LanguageCycleTest.check(!text.toLowerCase(java.util.Locale.ROOT).matches("(?s).*\\badb\\b.*"), field.getName() + " asks for no computer: " + text);
        texts++;
      }
    }
    for (FileFailure.Kind kind : FileFailure.Kind.values()) {
      LanguageCycleTest.check(!Copy.failure(kind).contains("adb"), kind + " asks for no computer");
    }
    LanguageCycleTest.check(texts > 0, "the copy has texts");
    System.out.println("CopyTest ok: " + texts + " texts");
  }
}
