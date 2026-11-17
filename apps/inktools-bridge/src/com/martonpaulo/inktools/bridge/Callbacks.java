package com.martonpaulo.inktools.bridge;

import java.util.Locale;
import java.util.Map;

/**
 * Which callback transaction means success (#215). The method names come from the callback
 * interface's generated Stub ({@code TRANSACTION_onSuccess = 1}); without them, the order AIDL
 * gives the methods #215 lists, onSuccess then onFailed, decides. No Android import.
 */
public final class Callbacks {
  public static final int DECLARED_SUCCESS = 1;

  private Callbacks() {}

  /** The method's name for a code, from the Stub's TRANSACTION_ constants; null when unknown. */
  public static String method(Map<String, Integer> transactions, int code) {
    for (Map.Entry<String, Integer> entry : transactions.entrySet()) {
      if (entry.getValue() == code) {
        return entry.getKey();
      }
    }
    return null;
  }

  /** True for a success method, such as onSuccess or onInstallSuccess. */
  public static boolean succeeded(String method, int code) {
    if (method == null) {
      return code == DECLARED_SUCCESS;
    }
    String lowered = method.toLowerCase(Locale.ROOT);
    return lowered.contains("success") && !lowered.contains("fail");
  }
}
