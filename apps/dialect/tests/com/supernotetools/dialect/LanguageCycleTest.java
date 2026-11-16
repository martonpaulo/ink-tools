package com.supernotetools.dialect;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Plain JVM test, no framework: run by `node scripts/build.cjs --test`. */
public final class LanguageCycleTest {
  public static void main(String[] args) {
    List<String> cycle = LanguageCycle.DEFAULT;
    check(LanguageCycle.next(cycle, "pt_BR").equals("en_US"), "pt_BR goes to en_US");
    check(LanguageCycle.next(cycle, "en_US").equals("es_ES"), "en_US goes to es_ES");
    check(LanguageCycle.next(cycle, "es_ES").equals("pt_BR"), "the last goes back to the first");
    check(LanguageCycle.next(cycle, "ja_JP").equals("pt_BR"), "a language outside the cycle goes to the first");
    check(LanguageCycle.next(cycle, null).equals("pt_BR"), "an unknown language goes to the first");
    check(LanguageCycle.next(Collections.singletonList("es_ES"), "es_ES").equals("es_ES"), "a cycle of one stays");
    try {
      LanguageCycle.next(Collections.<String>emptyList(), "pt_BR");
      throw new AssertionError("an empty cycle must be refused");
    } catch (IllegalArgumentException expected) {
      // refused
    }

    check(
        LanguageCycle.order(Arrays.asList("zh_TW", "es_ES", "ja_JP", "pt_BR"))
            .equals(Arrays.asList("pt_BR", "es_ES", "ja_JP", "zh_TW")),
        "the default codes first, in their order, then the others alphabetically");

    check(LanguageCycle.label("pt_BR", cycle).equals("PT"), "the label is the language part");
    List<String> chinese = Arrays.asList("pt_BR", "zh_CN", "zh_TW");
    check(LanguageCycle.label("zh_CN", chinese).equals("CN"), "a shared language part shows the country");
    check(LanguageCycle.label("zh_TW", chinese).equals("TW"), "a shared language part shows the country");
    check(LanguageCycle.label("pt_BR", chinese).equals("PT"), "a language part of its own stays");

    check(LanguageCycle.isCode("pt_BR"), "pt_BR is a code");
    for (String name : new String[] {"math", "mul", "pt-BR", "PT_BR", "../x", "", null}) {
      check(!LanguageCycle.isCode(name), name + " is not a code");
    }
    check(LanguageCycle.name("pt_BR").equals("Portuguese (Brazil)"), "the English name");
    System.out.println("LanguageCycleTest ok");
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
