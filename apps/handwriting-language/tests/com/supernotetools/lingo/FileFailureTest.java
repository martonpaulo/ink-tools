package com.supernotetools.lingo;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;

/** Every failure kind has its own plain sentence with a next step: run by `node scripts/build.cjs --test` (#280). */
public final class FileFailureTest {
  public static void main(String[] args) {
    for (FileFailure.Kind kind : FileFailure.Kind.values()) {
      String sentence = Copy.failure(kind);
      LanguageCycleTest.check(sentence != null && !sentence.isEmpty(), kind + " has a sentence");
      LanguageCycleTest.check(Character.isUpperCase(sentence.charAt(0)), kind + " starts in capitals");
      LanguageCycleTest.check(sentence.endsWith("."), kind + " ends with a full stop");
      LanguageCycleTest.check(!sentence.contains("/"), kind + " shows no path");
      // Only the access-off failure points at the permission: the others happen with it on.
      LanguageCycleTest.check(kind == FileFailure.Kind.FILES_OFF || !sentence.contains("All-files access"),
          kind + " does not send the owner to a permission that is already on");
      LanguageCycleTest.check(kind == FileFailure.Kind.OTHER || kind == FileFailure.Kind.FILES_OFF
          || !sentence.equals(Copy.FAILURE_OTHER), kind + " has its own sentence");
    }
    FileFailure raw = new FileFailure(FileFailure.Kind.CANNOT_READ, "cannot read /sdcard/x");
    LanguageCycleTest.check(!FileFailure.sentence(raw).contains("/sdcard"), "the detail never reaches the screen");
    LanguageCycleTest.check(FileFailure.sentence(new IOException("boom")).equals(Copy.FAILURE_OTHER), "a plain IOException maps to OTHER");
    internalFailureOfTheLanguageFolder();
    System.out.println("FileFailureTest ok");
  }

  /** A failed read or write of the folder is the adapter's failure value; the screen keeps its sentence (#294). */
  private static void internalFailureOfTheLanguageFolder() {
    Map<String, String> apps = Collections.singletonMap(Registry.SettingsLanguagePage.PACKAGE, "1.00.1");
    for (FileFailure.Kind kind : FileFailure.Kind.values()) {
      FileFailure failure = new FileFailure(kind, "cannot touch the language file");
      InternalFailure internal = failure.internal("switch", "test/fingerprint:11/1", apps);
      boolean device = kind == FileFailure.Kind.CANNOT_READ || kind == FileFailure.Kind.CANNOT_CREATE
          || kind == FileFailure.Kind.CANNOT_DELETE;
      LanguageCycleTest.check((internal != null) == device, kind + " is an internal failure only when the folder failed");
      if (internal == null) {
        continue;
      }
      String header = internal.agentLog().split("\n")[0];
      for (String field : new String[] {"registry=" + FileFailure.LANGUAGE_FILE_ITEM, "level=2", "owner=handwriting-language",
          "method=switch", "firmware=test/fingerprint:11/1", "apps=" + Registry.SettingsLanguagePage.PACKAGE + "@1.00.1"}) {
        LanguageCycleTest.check(header.contains(field), kind + " logs " + field);
      }
      LanguageCycleTest.check(internal.agentLog().contains("cause com.supernotetools.lingo.FileFailure: cannot touch the language file"),
          kind + " logs its cause");
      LanguageCycleTest.check(internal.userSentence(Copy.FAILURES).equals(FileFailure.sentence(failure)),
          kind + " shows the same sentence as the screen");
    }
  }
}
