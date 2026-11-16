package com.retouch.image;

/** Plain JVM test, no framework: run by `npm run test:native` (#136). */
public final class RetouchTest {
  private static final int WHITE = 0xFFFFFFFF;

  public static void main(String[] args) {
    cropsTheLassoMargin();
    gammaKeepsBlackAndWhiteAndMovesTheMiddle();
    sharpenLeavesFlatAreasAndRaisesAnEdge();
    enhanceGivesOnlyTheSixteenGreys();
    lighterAndDarkerMoveOppositeWays();
    enhanceScalesDownNeverUp();
    namesTheEdits();
    rotateTurnsClockwiseAndSwapsTheSize();
    mirrorAndFlipReverseTheirAxis();
    invertMakesDarkModePaper();
    trimCutsWhiteAndClearMargins();
    System.out.println("RetouchTest ok");
  }

  private static void cropsTheLassoMargin() {
    // A 6 x 5 preview whose centre 2 x 1 is black, as the lasso's margin around a picture.
    int[] argb = new int[30];
    java.util.Arrays.fill(argb, WHITE);
    argb[2 * 6 + 2] = gray(0);
    argb[2 * 6 + 3] = gray(0);
    Retouch.Picture cropped = Retouch.cropCentre(new Retouch.Picture(argb, 6, 5), 2, 1);
    check(cropped.width == 2 && cropped.height == 1, "the crop has the picture's size");
    check(cropped.argb[0] == gray(0) && cropped.argb[1] == gray(0), "the crop is the centre");
    Retouch.Picture same = Retouch.cropCentre(cropped, 10, 10);
    check(same == cropped, "a size above the picture keeps it");
  }

  private static void gammaKeepsBlackAndWhiteAndMovesTheMiddle() {
    int[] lighter = Retouch.gammaTable(Retouch.GAMMA_STEP);
    int[] darker = Retouch.gammaTable(1 / Retouch.GAMMA_STEP);
    check(lighter[0] == 0 && lighter[255] == 255, "lighter keeps black and white");
    check(darker[0] == 0 && darker[255] == 255, "darker keeps black and white");
    check(lighter[128] > 128 && darker[128] < 128, "the middle grey moves");
    try {
      Retouch.gammaTable(0);
      throw new AssertionError("a gamma of 0 must be refused");
    } catch (IllegalArgumentException expected) {
      // refused
    }
  }

  private static void sharpenLeavesFlatAreasAndRaisesAnEdge() {
    int[] flat = {gray(100), gray(100), gray(100), gray(100)};
    Retouch.sharpen(flat, 2, 2, Retouch.SHARPEN_AMOUNT);
    for (int pixel : flat) {
      check((pixel & 0xFF) == 100, "a flat area is unchanged");
    }
    // A 3 x 1 step from dark to light: the light side of the edge gets lighter.
    int[] edge = {gray(50), gray(200), gray(200)};
    Retouch.sharpen(edge, 3, 1, Retouch.SHARPEN_AMOUNT);
    check((edge[1] & 0xFF) > 200, "the edge's light side is raised");
    check((edge[0] & 0xFF) < 50, "the edge's dark side is lowered");
  }

  private static void enhanceGivesOnlyTheSixteenGreys() {
    int[] argb = new int[16 * 16];
    for (int i = 0; i < argb.length; i++) {
      // A red and green colour field with a gradient: colour in, greys out.
      argb[i] = 0xFF000000 | ((i % 256) << 16) | (((255 - i) % 256) << 8) | 40;
    }
    Retouch.Picture picture = new Retouch.Picture(argb, 16, 16);
    Retouch.enhance(picture);
    for (int pixel : picture.argb) {
      int r = (pixel >> 16) & 0xFF;
      check(r == (pixel & 0xFF) && r == ((pixel >> 8) & 0xFF), "the result is grey");
      check(r % 17 == 0, "the result uses only the 16 greys: " + r);
      check((pixel >>> 24) == 0xFF, "the result is opaque");
    }
  }

  private static void lighterAndDarkerMoveOppositeWays() {
    int[] base = {gray(119), gray(119), gray(119), gray(119)};
    Retouch.Picture lighter = new Retouch.Picture(base.clone(), 2, 2);
    Retouch.Picture darker = new Retouch.Picture(base.clone(), 2, 2);
    Retouch.apply(Retouch.Edit.LIGHTER, lighter);
    Retouch.apply(Retouch.Edit.DARKER, darker);
    check((lighter.argb[0] & 0xFF) > 119, "Lighter lightens the middle grey");
    check((darker.argb[0] & 0xFF) < 119, "Darker darkens the middle grey");
    check((lighter.argb[0] & 0xFF) % 17 == 0, "Lighter ends on one of the 16 greys");
  }

  private static void enhanceScalesDownNeverUp() {
    int[] down = Retouch.outputSize(Retouch.Edit.ENHANCE, 3000, 1500, 1920);
    check(down[0] == 1920 && down[1] == 960, "a wide picture fits the page width");
    int[] small = Retouch.outputSize(Retouch.Edit.ENHANCE, 400, 300, 1920);
    check(small[0] == 400 && small[1] == 300, "a small picture is never scaled up");
    int[] kept = Retouch.outputSize(Retouch.Edit.LIGHTER, 3000, 1500, 1920);
    check(kept[0] == 3000 && kept[1] == 1500, "Lighter keeps the size");
  }

  private static void namesTheEdits() {
    check(Retouch.Edit.of("enhance") == Retouch.Edit.ENHANCE, "enhance is known");
    check(Retouch.Edit.of("darker") == Retouch.Edit.DARKER, "darker is known");
    check(Retouch.Edit.of("invert") == Retouch.Edit.INVERT, "invert is known");
    try {
      Retouch.Edit.of("blur");
      throw new AssertionError("an unknown edit must be refused");
    } catch (IllegalArgumentException expected) {
      // refused
    }
  }

  private static void rotateTurnsClockwiseAndSwapsTheSize() {
    // A 3 x 2 picture with pixels 0..5, row by row: 0 1 2 / 3 4 5.
    int[] argb = {gray(0), gray(1), gray(2), gray(3), gray(4), gray(5)};
    Retouch.Picture source = new Retouch.Picture(argb.clone(), 3, 2);
    Retouch.Picture turned = Retouch.apply(Retouch.Edit.ROTATE, source);
    check(turned.width == 2 && turned.height == 3, "Rotate swaps width and height");
    // Clockwise: 3 0 / 4 1 / 5 2.
    int[] want = {3, 0, 4, 1, 5, 2};
    for (int i = 0; i < want.length; i++) {
      check((turned.argb[i] & 0xFF) == want[i], "Rotate turns clockwise at " + i);
    }
    check(java.util.Arrays.equals(source.argb, argb), "Rotate leaves the source as it was");
    Retouch.Picture back = turned;
    for (int i = 0; i < 3; i++) {
      back = Retouch.rotate(back);
    }
    check(java.util.Arrays.equals(back.argb, argb), "four turns give the picture back");
    int[] kept = Retouch.outputSize(Retouch.Edit.ROTATE, 3000, 1500, 1920);
    check(kept[0] == 3000 && kept[1] == 1500, "Rotate is never scaled to the page");
  }

  private static void mirrorAndFlipReverseTheirAxis() {
    int[] argb = {gray(0), gray(1), gray(2), gray(3), gray(4), gray(5)};
    Retouch.Picture mirrored = new Retouch.Picture(argb.clone(), 3, 2);
    check(Retouch.apply(Retouch.Edit.MIRROR, mirrored) == mirrored, "Mirror works in place");
    int[] wantMirror = {2, 1, 0, 5, 4, 3};
    Retouch.Picture flipped = new Retouch.Picture(argb.clone(), 3, 2);
    Retouch.apply(Retouch.Edit.FLIP, flipped);
    int[] wantFlip = {3, 4, 5, 0, 1, 2};
    for (int i = 0; i < argb.length; i++) {
      check((mirrored.argb[i] & 0xFF) == wantMirror[i], "Mirror reverses each row at " + i);
      check((flipped.argb[i] & 0xFF) == wantFlip[i], "Flip reverses the rows at " + i);
    }
    // An odd height keeps its middle row.
    Retouch.Picture odd = new Retouch.Picture(new int[] {gray(7), gray(8), gray(9)}, 1, 3);
    Retouch.flip(odd);
    check((odd.argb[1] & 0xFF) == 8, "Flip keeps the middle row");
  }

  private static void invertMakesDarkModePaper() {
    // Dark mode: near-black background, light text, a half-transparent red mark.
    int[] argb = {gray(20), gray(230), 0x80FF0000};
    Retouch.Picture picture = new Retouch.Picture(argb, 3, 1);
    Retouch.apply(Retouch.Edit.INVERT, picture);
    check((picture.argb[0] & 0xFF) == 235, "the dark background becomes paper");
    check((picture.argb[1] & 0xFF) == 25, "the light text becomes ink");
    check(picture.argb[2] == 0x8000FFFF, "a colour inverts and keeps its alpha");
    check((picture.argb[0] >>> 24) == 0xFF, "an opaque pixel stays opaque");
  }

  private static void trimCutsWhiteAndClearMargins() {
    // A 5 x 4 picture: near-white paper, one clear pixel, and ink at (1, 1) and (3, 2).
    int[] argb = new int[20];
    java.util.Arrays.fill(argb, gray(Retouch.TRIM_WHITE));
    argb[0] = 0x00000000;
    argb[1 * 5 + 1] = gray(0);
    argb[2 * 5 + 3] = gray(Retouch.TRIM_WHITE - 1);
    Retouch.Picture picture = new Retouch.Picture(argb, 5, 4);
    int[] box = Retouch.trimBox(picture);
    check(java.util.Arrays.equals(box, new int[] {1, 1, 3, 2}), "the box holds only the ink");
    Retouch.Picture trimmed = Retouch.apply(Retouch.Edit.TRIM, picture);
    check(trimmed.width == 3 && trimmed.height == 2, "Trim keeps the box's size");
    check(trimmed.argb[0] == gray(0), "Trim starts at the box's top left");
    Retouch.Picture blank = new Retouch.Picture(new int[] {WHITE, WHITE}, 2, 1);
    check(Retouch.apply(Retouch.Edit.TRIM, blank) == blank, "an all-white picture is kept");
    Retouch.Picture full = new Retouch.Picture(new int[] {gray(0), gray(0)}, 2, 1);
    check(Retouch.apply(Retouch.Edit.TRIM, full) == full, "a picture with no margin is kept");
    try {
      Retouch.crop(full, new int[] {1, 0, 2, 1});
      throw new AssertionError("a box past the edge must be refused");
    } catch (IllegalArgumentException expected) {
      // refused
    }
  }

  private static int gray(int g) {
    return 0xFF000000 | (g << 16) | (g << 8) | g;
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
