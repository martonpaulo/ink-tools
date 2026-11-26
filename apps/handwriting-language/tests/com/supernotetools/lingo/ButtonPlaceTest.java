package com.supernotetools.lingo;

/** Plain JVM test, no framework: a saved place stays on every screen the tablets have (#244). */
public final class ButtonPlaceTest {
  /** About the 10 mm touch target the floating button is (Tokens.TOUCH_TARGET_MM). */
  private static final int SIZE = 120;
  /** About the 3 mm gap kept from every edge (Tokens.SPACE_MM, #415). */
  private static final int INSET = 35;
  /** The Manta and the Nomad (docs/supernote.md › Screen and units), each portrait and landscape. */
  private static final int[][] SCREENS = {{1920, 2560}, {2560, 1920}, {1404, 1872}, {1872, 1404}};
  private static final float[] FRACTIONS = {0f, 0.25f, 0.5f, 1f, -0.5f, 1.5f, Float.NaN};

  public static void main(String[] args) {
    for (int[] screen : SCREENS) {
      for (float fx : FRACTIONS) {
        for (float fy : FRACTIONS) {
          int x = ButtonPlace.pixels(fx, screen[0], SIZE, INSET);
          int y = ButtonPlace.pixels(fy, screen[1], SIZE, INSET);
          String where = screen[0] + "x" + screen[1] + " at " + fx + "," + fy;
          check(x >= INSET && x + SIZE + INSET <= screen[0], "the whole button is on screen, inset from its edges, across, " + where);
          check(y >= INSET && y + SIZE + INSET <= screen[1], "the whole button is on screen, inset from its edges, down, " + where);
        }
      }
      check(ButtonPlace.pixels(ButtonPlace.DEFAULT_X, screen[0], SIZE, INSET) == screen[0] - SIZE - INSET,
          "the default sits one inset from the trailing edge on " + screen[0] + "x" + screen[1]);
      check(ButtonPlace.pixels(ButtonPlace.defaultY(screen[1], SIZE, INSET), screen[1], SIZE, INSET) == ButtonPlace.TOP_PX,
          "the default sits " + ButtonPlace.TOP_PX + " px down on " + screen[0] + "x" + screen[1]);
    }

    check(ButtonPlace.fraction(INSET, 1404, SIZE, INSET) == 0f, "one inset from the leading edge is 0");
    check(ButtonPlace.fraction(1404 - SIZE - INSET, 1404, SIZE, INSET) == 1f, "one inset from the trailing edge is 1");
    check(ButtonPlace.fraction(-40, 1404, SIZE, INSET) == 0f, "a drag past the leading edge stops at it");
    check(ButtonPlace.fraction(5000, 1404, SIZE, INSET) == 1f, "a drag past the trailing edge stops at it");
    check(ButtonPlace.pixels(ButtonPlace.fraction(640, 1920, SIZE, INSET), 1920, SIZE, INSET) == 640, "a place round-trips");

    float bottom = ButtonPlace.fraction(2560 - SIZE - INSET, 2560, SIZE, INSET);
    check(ButtonPlace.pixels(bottom, 1404, SIZE, INSET) == 1404 - SIZE - INSET, "the bottom stays the bottom when the screen turns");

    check(ButtonPlace.clamp(-30, 1404, SIZE, INSET) == INSET, "a drag past the leading edge stops one inset from it, in pixels");
    check(ButtonPlace.clamp(1400, 1404, SIZE, INSET) == 1404 - SIZE - INSET, "a drag past the trailing edge stops one inset from it, in pixels");
    check(ButtonPlace.clamp(500, 1404, SIZE, INSET) == 500, "a drag on screen is kept");
    check(ButtonPlace.fraction(10, 100, SIZE, INSET) == 0f, "a screen smaller than the button puts it at 0");
    check(ButtonPlace.pixels(0.7f, 100, SIZE, INSET) == 0, "a screen smaller than the button never gives a negative place");
    check(ButtonPlace.pixels(1f, 150, SIZE, INSET) == 0, "a screen too small for the insets puts the button at 0");
    check(ButtonPlace.clamp(80, 150, SIZE, INSET) == 0, "a screen too small for the insets keeps a drag at 0");
    check(ButtonPlace.pixels(1f, 1404, SIZE, 0) == 1404 - SIZE, "no inset rests flush, as before #415");
    snapChecks();
    System.out.println("ButtonPlaceTest ok");
  }

  /** The button always rests against an edge, fully on screen (#275). */
  private static void snapChecks() {
    for (int[] screen : SCREENS) {
      int w = screen[0];
      int h = screen[1];
      String on = " on " + w + "x" + h;
      float[] a = ButtonPlace.snap(0.9f, 0.5f, w, h, SIZE, INSET);
      check(a[0] == 1f && a[1] == 0.5f, "a drop near the right edge snaps right, keeping its height" + on);
      a = ButtonPlace.snap(0.1f, 0.5f, w, h, SIZE, INSET);
      check(a[0] == 0f && a[1] == 0.5f, "a drop near the left edge snaps left" + on);
      a = ButtonPlace.snap(0.4f, 0.02f, w, h, SIZE, INSET);
      check(a[0] == 0.4f && a[1] == 0f, "a drop near the top snaps to the top, keeping its place along it" + on);
      a = ButtonPlace.snap(0.4f, 0.98f, w, h, SIZE, INSET);
      check(a[0] == 0.4f && a[1] == 1f, "a drop near the bottom snaps to the bottom" + on);
      a = ButtonPlace.snap(0.5f, 0.5f, w, h, SIZE, INSET);
      check(a[0] == 0f || a[0] == 1f || a[1] == 0f || a[1] == 1f, "the middle snaps to some edge" + on);
      // Past an edge, or saved off screen by an older build: still fully on screen.
      a = ButtonPlace.snap(1.7f, -0.4f, w, h, SIZE, INSET);
      int x = ButtonPlace.pixels(a[0], w, SIZE, INSET);
      int y = ButtonPlace.pixels(a[1], h, SIZE, INSET);
      check(x >= INSET && x + SIZE + INSET <= w && y >= INSET && y + SIZE + INSET <= h,
          "a drop past an edge stays on screen, inset from its edges" + on);
      check(a[0] == 1f || a[1] == 0f, "a drop past a corner rests on an edge" + on);
      a = ButtonPlace.snap(Float.NaN, Float.NaN, w, h, SIZE, INSET);
      check(a[0] == 0f || a[1] == 0f, "an unreadable place rests on an edge" + on);
      // The default place is already against the trailing edge.
      a = ButtonPlace.snap(ButtonPlace.DEFAULT_X, ButtonPlace.defaultY(h, SIZE, INSET), w, h, SIZE, INSET);
      check(a[0] == 1f && ButtonPlace.pixels(a[1], h, SIZE, INSET) == ButtonPlace.TOP_PX, "the default is unchanged" + on);
      // A screen turn: a saved edge place stays on an edge on the turned screen.
      float[] turned = ButtonPlace.snap(a[0], a[1], h, w, SIZE, INSET);
      check(turned[0] == 1f, "a right-edge place stays right after the screen turns" + on);
      a = ButtonPlace.snap(0.3f, 1f, w, h, SIZE, INSET);
      turned = ButtonPlace.snap(a[0], a[1], h, w, SIZE, INSET);
      check(turned[1] == 1f && turned[0] == 0.3f, "a bottom-edge place stays at the bottom after a turn" + on);
    }
    // A place nearer the long side's edge wins by pixels, not by fraction.
    float[] a = ButtonPlace.snap(0.5f, 0.1f, 1404, 1872, SIZE, INSET);
    check(a[1] == 0f && a[0] == 0.5f, "the nearest edge is measured in pixels");
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
