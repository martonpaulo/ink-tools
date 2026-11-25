package com.supernotetools.lingo;

/**
 * Where the floating button sits (#244). The saved place is two fractions of the free range
 * (`x / (width - size)`), so it stays on screen when the screen turns or the size changes. No
 * Android import, so a JVM test covers it.
 */
final class ButtonPlace {
  private ButtonPlace() {}

  /**
   * The default place's distance from the top, where lane 4's test button sat
   * (docs/research/2026-11-handwriting-language.md § 10).
   */
  static final int TOP_PX = 600;
  /** The default place's horizontal fraction: the trailing (right) edge. */
  static final float DEFAULT_X = 1f;

  /** The fraction of the free range that `px` is at; 0 when the button fills the screen. */
  static float fraction(float px, int screen, int size) {
    int free = screen - size;
    if (free <= 0) {
      return 0f;
    }
    return clampFraction(px / free);
  }

  /** The pixel position of `fraction`, always on screen; NaN counts as 0. */
  static int pixels(float fraction, int screen, int size) {
    int free = Math.max(0, screen - size);
    return Math.round(clampFraction(fraction) * free);
  }

  /** `px` moved onto the screen: a drag past an edge stops at it. */
  static int clamp(int px, int screen, int size) {
    return Math.max(0, Math.min(px, screen - size));
  }

  /**
   * The place the button rests at: `fx`, `fy` moved to the nearest of the four screen edges (by
   * pixels), keeping its position along that edge, fully on screen (#275). Applied when a drag
   * ends and again when a place is read, so an older build's middle or off-screen place snaps too.
   * Returns `{x, y}` fractions; one of them is 0 or 1.
   */
  static float[] snap(float fx, float fy, int width, int height, int size) {
    float x = clampFraction(fx);
    float y = clampFraction(fy);
    float left = x * Math.max(0, width - size);
    float right = (1f - x) * Math.max(0, width - size);
    float top = y * Math.max(0, height - size);
    float bottom = (1f - y) * Math.max(0, height - size);
    float nearest = Math.min(Math.min(left, right), Math.min(top, bottom));
    if (nearest == right) {
      return new float[] {1f, y};
    }
    if (nearest == left) {
      return new float[] {0f, y};
    }
    if (nearest == bottom) {
      return new float[] {x, 1f};
    }
    return new float[] {x, 0f};
  }

  /** The default place's vertical fraction on a screen of `height`. */
  static float defaultY(int height, int size) {
    return fraction(TOP_PX, height, size);
  }

  private static float clampFraction(float value) {
    if (Float.isNaN(value) || value < 0f) {
      return 0f;
    }
    return Math.min(value, 1f);
  }
}
