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
    everyStyleEndsOnTheScreensGreys();
    otsuSplitsTwoTonesAndKeepsOneGray();
    floydSteinbergKeepsAFlatGraysMean();
    thickerLinesInkMore();
    whiteToTransparentClearsOnlyWhite();
    stylesScaleDownAndSurviveTinyPictures();
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

  /** A 24 x 24 colour fixture with a dark square, alpha at the corner: input for every style. */
  private static Retouch.Picture fixture(int size) {
    int[] argb = new int[size * size];
    for (int y = 0; y < size; y++) {
      for (int x = 0; x < size; x++) {
        boolean square = x > size / 4 && x < 3 * size / 4 && y > size / 4 && y < 3 * size / 4;
        int alpha = x == 0 && y == 0 ? 0 : 0xFF;
        argb[y * size + x] = square
            ? (alpha << 24) | 0x203040
            : (alpha << 24) | ((x * 9 % 256) << 16) | ((y * 7 % 256) << 8) | 200;
      }
    }
    return new Retouch.Picture(argb, size, size);
  }

  private static void everyStyleEndsOnTheScreensGreys() {
    Retouch.Edit[] styles = {
      Retouch.Edit.PHOTO, Retouch.Edit.LINE_ART, Retouch.Edit.BLACK_WHITE,
      Retouch.Edit.DITHER, Retouch.Edit.ATKINSON
    };
    for (Retouch.Edit style : styles) {
      check(style.isStyle(), style + " is a style");
      Retouch.Picture picture = Retouch.apply(style, fixture(24));
      boolean twoTone = style == Retouch.Edit.BLACK_WHITE || style == Retouch.Edit.ATKINSON;
      for (int pixel : picture.argb) {
        int r = (pixel >> 16) & 0xFF;
        check(r == (pixel & 0xFF) && r == ((pixel >> 8) & 0xFF), style + " gives grey");
        check(r % 17 == 0, style + " uses only the 16 greys: " + r);
        check(!twoTone || r == 0 || r == 255, style + " gives only black and white: " + r);
        check((pixel >>> 24) == 0xFF, style + " is opaque without the option");
      }
    }
    check(!Retouch.Edit.TRIM.isStyle() && !Retouch.Edit.ENHANCE.isStyle(), "edits are no styles");
    check(Retouch.Edit.of("line_art") == Retouch.Edit.LINE_ART, "line_art is known");
    check(Retouch.Edit.of("black_white") == Retouch.Edit.BLACK_WHITE, "black_white is known");
  }

  private static void otsuSplitsTwoTonesAndKeepsOneGray() {
    int[] two = {gray(40), gray(40), gray(200), gray(200), gray(210)};
    int t = Retouch.otsu(two);
    check(t >= 40 && t < 200, "the split falls between the two tones: " + t);
    Retouch.Picture light = new Retouch.Picture(new int[] {gray(200), gray(200)}, 2, 1);
    Retouch.style(Retouch.Edit.BLACK_WHITE, light, false, false);
    check((light.argb[0] & 0xFF) == 255, "a light picture of one grey stays white");
    Retouch.Picture dark = new Retouch.Picture(new int[] {gray(60), gray(60)}, 2, 1);
    Retouch.style(Retouch.Edit.BLACK_WHITE, dark, false, false);
    check((dark.argb[0] & 0xFF) == 0, "a dark picture of one grey turns black");
  }

  private static void floydSteinbergKeepsAFlatGraysMean() {
    int[] flat = new int[32 * 32];
    java.util.Arrays.fill(flat, gray(128));
    Retouch.diffuse(flat, 32, 32, false);
    double sum = 0;
    for (int pixel : flat) {
      sum += pixel & 0xFF;
    }
    check(Math.abs(sum / flat.length - 128) < 3, "the mean stays near 128: " + sum / flat.length);
    int[] mid = new int[32 * 32];
    java.util.Arrays.fill(mid, gray(128));
    Retouch.diffuse(mid, 32, 32, true);
    long black = java.util.Arrays.stream(mid).filter(p -> (p & 0xFF) == 0).count();
    check(black > 300 && black < 724, "Atkinson mixes black and white for a mid grey: " + black);
  }

  private static void thickerLinesInkMore() {
    Retouch.Picture thin = fixture(24);
    Retouch.Picture thick = fixture(24);
    Retouch.style(Retouch.Edit.LINE_ART, thin, false, false);
    Retouch.style(Retouch.Edit.LINE_ART, thick, false, true);
    check(ink(thick) > ink(thin) && ink(thin) > 0, "thicker lines ink more pixels");
  }

  private static void whiteToTransparentClearsOnlyWhite() {
    Retouch.Picture picture =
        new Retouch.Picture(new int[] {gray(255), gray(0), 0x00FFFFFF, gray(250)}, 2, 2);
    Retouch.style(Retouch.Edit.BLACK_WHITE, picture, true, false);
    check((picture.argb[0] >>> 24) == 0, "white becomes clear");
    check(picture.argb[1] == gray(0), "black stays opaque");
    check((picture.argb[2] >>> 24) == 0, "a clear pixel stays clear");
  }

  private static void stylesScaleDownAndSurviveTinyPictures() {
    int[] down = Retouch.outputSize(Retouch.Edit.DITHER, 3000, 1500, 1920);
    check(down[0] == 1920 && down[1] == 960, "a style fits the page width");
    Retouch.Edit[] styles = {Retouch.Edit.DITHER, Retouch.Edit.ATKINSON, Retouch.Edit.LINE_ART};
    for (Retouch.Edit style : styles) {
      Retouch.apply(style, new Retouch.Picture(new int[] {gray(90)}, 1, 1));
      Retouch.apply(style, new Retouch.Picture(new int[40], 40, 1));
    }
  }

  private static long ink(Retouch.Picture picture) {
    return java.util.Arrays.stream(picture.argb).filter(p -> (p & 0xFF) < 128).count();
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
