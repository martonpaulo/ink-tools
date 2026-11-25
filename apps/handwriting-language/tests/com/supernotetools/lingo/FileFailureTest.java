package com.supernotetools.lingo;

import java.io.IOException;

/** Every failure kind has its own plain sentence with a next step: run by `node scripts/build.cjs --test` (#280). */
public final class FileFailureTest {
  public static void main(String[] args) {
    for (FileFailure.Kind kind : FileFailure.Kind.values()) {
      String sentence = Copy.failure(kind);
      LanguageCycleTest.check(sentence != null && !sentence.isEmpty(), kind + " has a sentence");
      LanguageCycleTest.check(Character.isUpperCase(sentence.charAt(0)), kind + " starts in capitals");
      LanguageCycleTest.check(sentence.endsWith("."), kind + " ends with a full stop");
      LanguageCycleTest.check(!sentence.contains("/"), kind + " shows no path");
      LanguageCycleTest.check(kind == FileFailure.Kind.OTHER || kind == FileFailure.Kind.FILES_OFF
          || !sentence.equals(Copy.FAILURE_OTHER), kind + " has its own sentence");
    }
    FileFailure raw = new FileFailure(FileFailure.Kind.CANNOT_READ, "cannot read /sdcard/x");
    LanguageCycleTest.check(!FileFailure.sentence(raw).contains("/sdcard"), "the detail never reaches the screen");
    LanguageCycleTest.check(FileFailure.sentence(new IOException("boom")).equals(Copy.FAILURE_OTHER), "a plain IOException maps to OTHER");
    System.out.println("FileFailureTest ok");
  }
}
