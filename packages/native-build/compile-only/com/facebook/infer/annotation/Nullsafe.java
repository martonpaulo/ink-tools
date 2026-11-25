package com.facebook.infer.annotation;

/**
 * Compile-only stand-in for Infer's annotation, which React Native's classes carry but its jar does
 * not ship. Without it javac 25 warns «unknown enum constant Mode.LOCAL» on any class that touches
 * one of them, and -Werror fails the build. It is on the compile class path only, never in app.npk.
 */
public @interface Nullsafe {
  Mode value();

  enum Mode {
    LOCAL,
    STRICT
  }
}
