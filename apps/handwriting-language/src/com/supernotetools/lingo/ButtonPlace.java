package com.supernotetools.lingo;

/**
 * Where the floating button sits (#244). The saved place is two fractions of the free range
 * (`(x - inset) / (width - size - 2 * inset)`), so it stays on screen when the screen turns or the
 * size changes. `inset` is the gap kept between the button and every screen edge (ui-kit token
 * `space`, #415): flush against an edge, its border met the screen's own edge and the button read as
 * cut. No Android import, so a JVM test covers it.
 */
final class ButtonPlace {
  private ButtonPlace() {}

  /** The default place's horizontal fraction: the trailing (right) edge. */
  static final float DEFAULT_X = 1f;
  /**
   * The default place's vertical fraction: on the trailing edge between the end of the note
   * toolbar's side band and the bottom band, so the button covers no toolbar control wherever the
   * toolbar sits (#587). On the Manta that is y 2206 of 2560 in portrait (the side band ends at
   * 1843, the bottom band starts at 2444) and y 1620 of 1920 in landscape (1557 and 1804,
   * docs/supernote.md › Screen and units). A fraction, not pixels, so a screen turn keeps it clear.
   */
  static final float DEFAULT_Y = 0.916f;

  /** The fraction of the free range that `px` is at; 0 when the button and its insets fill the screen. */
  static float fraction(float px, int screen, int size, int inset) {
    int free = free(screen, size, inset);
    if (free <= 0) {
      return 0f;
    }
    return clampFraction((px - inset) / free);
  }

  /** The pixel position of `fraction`, always on screen and `inset` from its edges; NaN counts as 0. */
  static int pixels(float fraction, int screen, int size, int inset) {
    return start(screen, size, inset) + Math.round(clampFraction(fraction) * Math.max(0, free(screen, size, inset)));
  }

  /** `px` moved onto the screen, `inset` from its edges: a drag past an edge stops there. */
  static int clamp(int px, int screen, int size, int inset) {
    int start = start(screen, size, inset);
    return Math.max(start, Math.min(px, start + Math.max(0, free(screen, size, inset))));
  }

  /**
   * The place the button rests at: `fx`, `fy` moved to the nearest of the four screen edges (by
   * pixels), keeping its position along that edge, fully on screen and `inset` from the edge (#275,
   * #415). Applied when a drag
   * ends and again when a place is read, so an older build's middle or off-screen place snaps too.
   * Returns `{x, y}` fractions; one of them is 0 or 1.
   */
  static float[] snap(float fx, float fy, int width, int height, int size, int inset) {
    float x = clampFraction(fx);
    float y = clampFraction(fy);
    float left = x * Math.max(0, free(width, size, inset));
    float right = (1f - x) * Math.max(0, free(width, size, inset));
    float top = y * Math.max(0, free(height, size, inset));
    float bottom = (1f - y) * Math.max(0, free(height, size, inset));
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

  /** The range the button's leading edge moves in; negative when the screen is too small. */
  private static int free(int screen, int size, int inset) {
    return screen - size - 2 * inset;
  }

  /** The first place the button may sit: `inset`, or 0 when the button and its insets do not fit. */
  private static int start(int screen, int size, int inset) {
    return free(screen, size, inset) >= 0 ? inset : 0;
  }

  private static float clampFraction(float value) {
    if (Float.isNaN(value) || value < 0f) {
      return 0f;
    }
    return Math.min(value, 1f);
  }
}
