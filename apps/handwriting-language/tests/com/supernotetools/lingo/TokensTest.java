package com.supernotetools.lingo;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Properties;

/**
 * Plain JVM test, no framework (#275): every token of ui-kit's tokens.json, read through the
 * properties scripts/build.cjs writes from it, is in the generated `Tokens` with the same name
 * and value, and `Tokens` holds nothing else. Argument: the properties file.
 */
public final class TokensTest {
  public static void main(String[] args) throws IOException, IllegalAccessException {
    Properties expected = new Properties();
    try (InputStream in = new FileInputStream(args[0])) {
      expected.load(in);
    }
    check(!expected.isEmpty(), "tokens.json gives tokens");
    int fields = 0;
    for (Field field : Tokens.class.getDeclaredFields()) {
      if (!Modifier.isStatic(field.getModifiers())) {
        continue;
      }
      fields++;
      String name = field.getName();
      String want = expected.getProperty(name);
      check(want != null, name + " is a token of tokens.json");
      Object have = field.get(null);
      if (field.getType() == float.class) {
        check((Float) have == Float.parseFloat(want), name + " is " + want + ", not " + have);
      } else if (field.getType() == int.class) {
        int colour = 0xff000000 | Integer.parseInt(want.substring(1), 16);
        check((Integer) have == colour, name + " is " + want + ", not " + Integer.toHexString((Integer) have));
      } else {
        check(want.equals(have), name + " is «" + want + "», not «" + have + "»");
      }
    }
    check(fields == expected.size(), "Tokens holds all " + expected.size() + " tokens, not " + fields);
    System.out.println("TokensTest ok: " + fields + " tokens");
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
