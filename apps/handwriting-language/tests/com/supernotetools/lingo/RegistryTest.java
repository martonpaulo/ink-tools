package com.supernotetools.lingo;

import java.util.HashSet;
import java.util.Set;

/** The generated registry reader loads: run by `node scripts/build.cjs --test` (#294). */
public final class RegistryTest {
  public static void main(String[] args) {
    Set<String> ids = new HashSet<>();
    for (Registry.Item item : Registry.ITEMS) {
      LanguageCycleTest.check(ids.add(item.id), item.id + " is listed once");
      LanguageCycleTest.check(item.level >= 1 && item.level <= 5, item.id + " has a level from 1 to 5");
      LanguageCycleTest.check((item.probe == null) != (item.unprobed == null), item.id + " has a probe or an unprobed reason");
    }
    LanguageCycleTest.check(ids.contains("handwriting.language-file"), "the language file is in the reader");
    LanguageCycleTest.check(Registry.HandwritingLanguageFile.CURRENT.equals("default"), "the current language folder is default");
    LanguageCycleTest.check(!Registry.HandwritingChangedBroadcast.ACTION.isEmpty(), "the broadcast has an action");
    System.out.println("RegistryTest ok");
  }
}
