package com.supernotetools.lingo;

/** Plain JVM test, no framework: a saved place stays on every screen the tablets have (#244). */
public final class ButtonPlaceTest {
  /** 64 dp at density 300. */
  private static final int SIZE = 120;
  /** The Manta and the Nomad (docs/supernote.md › Screen and units), each portrait and landscape. */
  private static final int[][] SCREENS = {{1920, 2560}, {2560, 1920}, {1404, 1872}, {1872, 1404}};
  private static final float[] FRACTIONS = {0f, 0.25f, 0.5f, 1f, -0.5f, 1.5f, Float.NaN};

  public static void main(String[] args) {
    for (int[] screen : SCREENS) {
      for (float fx : FRACTIONS) {
        for (float fy : FRACTIONS) {
          int x = ButtonPlace.pixels(fx, screen[0], SIZE);
          int y = ButtonPlace.pixels(fy, screen[1], SIZE);
          String where = screen[0] + "x" + screen[1] + " at " + fx + "," + fy;
          check(x >= 0 && x + SIZE <= screen[0], "the whole button is on screen across, " + where);
          check(y >= 0 && y + SIZE <= screen[1], "the whole button is on screen down, " + where);
        }
      }
      check(ButtonPlace.pixels(ButtonPlace.DEFAULT_X, screen[0], SIZE) == screen[0] - SIZE,
          "the default sits at the trailing edge on " + screen[0] + "x" + screen[1]);
      check(ButtonPlace.pixels(ButtonPlace.defaultY(screen[1], SIZE), screen[1], SIZE) == ButtonPlace.TOP_PX,
          "the default sits " + ButtonPlace.TOP_PX + " px down on " + screen[0] + "x" + screen[1]);
    }

    check(ButtonPlace.fraction(0, 1404, SIZE) == 0f, "the leading edge is 0");
    check(ButtonPlace.fraction(1404 - SIZE, 1404, SIZE) == 1f, "the trailing edge is 1");
    check(ButtonPlace.fraction(-40, 1404, SIZE) == 0f, "a drag past the leading edge stops at it");
    check(ButtonPlace.fraction(5000, 1404, SIZE) == 1f, "a drag past the trailing edge stops at it");
    check(ButtonPlace.pixels(ButtonPlace.fraction(640, 1920, SIZE), 1920, SIZE) == 640, "a place round-trips");

    float bottom = ButtonPlace.fraction(2560 - SIZE, 2560, SIZE);
    check(ButtonPlace.pixels(bottom, 1404, SIZE) == 1404 - SIZE, "the bottom stays the bottom when the screen turns");

    check(ButtonPlace.clamp(-30, 1404, SIZE) == 0, "a drag past the leading edge stops at it, in pixels");
    check(ButtonPlace.clamp(1400, 1404, SIZE) == 1404 - SIZE, "a drag past the trailing edge stops at it, in pixels");
    check(ButtonPlace.clamp(500, 1404, SIZE) == 500, "a drag on screen is kept");
    check(ButtonPlace.fraction(10, 100, SIZE) == 0f, "a screen smaller than the button puts it at 0");
    check(ButtonPlace.pixels(0.7f, 100, SIZE) == 0, "a screen smaller than the button never gives a negative place");
    System.out.println("ButtonPlaceTest ok");
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
