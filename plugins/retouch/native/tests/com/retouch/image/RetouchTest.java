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
    cropNeedsItsBox();
    everyStyleEndsOnTheScreensGreys();
    otsuSplitsTwoTonesAndKeepsOneGray();
    floydSteinbergKeepsAFlatGraysMean();
    thickerLinesInkMore();
    whiteToTransparentClearsOnlyWhite();
    stylesScaleDownAndSurviveTinyPictures();
    cutoutClearsTheBorderAndKeepsTheObject();
    cutoutKeepsAnObjectOnTheBorderAndAnInteriorHole();
    cutoutKeepsAnAllBackgroundPictureAndTinySizes();
    stickerFillsWhiteOrClearsWithTheOption();
    thresholdGivesBlackAndWhite();
    documentFindsThePageQuadEitherContrast();
    documentWarpsAQuadToAnUprightRectangle();
    documentCleansWithoutAQuadWhenThePageFillsTheFrame();
    documentScalesDownAndSurvivesTinyPictures();
    eraseNeedsItsMarksAndKeepsTheSize();
    eraseClearsABandAlongAnOpenMark();
    eraseClearsTheInsideOfAClosedMark();
    eraseFillsALoopDrawnTwiceRound();
    eraseSurvivesTinyPicturesAndMarksOutside();
    eraseRefusesBadMarkEnds();
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

  private static void cropNeedsItsBox() {
    check(Retouch.Edit.of("crop") == Retouch.Edit.CROP, "crop is known");
    check(!Retouch.Edit.CROP.isStyle(), "Crop is no style");
    check(java.util.Arrays.equals(Retouch.outputSize(Retouch.Edit.CROP, 3000, 2000, 1920),
        new int[] {3000, 2000}), "Crop keeps the size before it cuts");
    try {
      Retouch.apply(Retouch.Edit.CROP, new Retouch.Picture(new int[] {WHITE}, 1, 1));
      throw new AssertionError("Crop without a box must be refused");
    } catch (IllegalArgumentException expected) {
      // refused: the box comes from the pen, through RetouchModule.crop
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

  private static void cutoutClearsTheBorderAndKeepsTheObject() {
    // A 5 x 5 white picture with a 3 x 3 black object in the centre.
    Retouch.Picture picture = filled(5, 5, gray(255));
    blackSquare(picture);
    Retouch.removeBackground(picture);
    check((picture.argb[0] >>> 24) == 0, "a border corner becomes clear");
    check((picture.argb[2 * 5 + 2] & 0xFF) == 0, "the object's centre stays black");
    check((picture.argb[2 * 5 + 2] >>> 24) == 0xFF, "the object stays opaque");
  }

  private static void cutoutKeepsAnObjectOnTheBorderAndAnInteriorHole() {
    // A black bar flush to the left edge: it blocks the flood, so it is kept.
    Retouch.Picture bar = filled(5, 5, gray(255));
    for (int y = 0; y < 5; y++) {
      bar.argb[y * 5] = gray(0);
    }
    Retouch.removeBackground(bar);
    check(bar.argb[2 * 5] == gray(0), "an object flush to the border is kept");
    check((bar.argb[2 * 5 + 4] >>> 24) == 0, "the far-side background is cleared");
    // A white hole inside the object is never reached from the border, so it stays.
    Retouch.Picture hole = filled(5, 5, gray(255));
    blackSquare(hole);
    hole.argb[2 * 5 + 2] = gray(255);
    Retouch.removeBackground(hole);
    check(hole.argb[2 * 5 + 2] == gray(255), "a hole inside the object is kept, not cleared");
    check((hole.argb[0] >>> 24) == 0, "the outer background is still cleared");
  }

  private static void cutoutKeepsAnAllBackgroundPictureAndTinySizes() {
    Retouch.Picture allWhite = filled(2, 2, gray(255));
    Retouch.removeBackground(allWhite);
    for (int pixel : allWhite.argb) {
      check(pixel == gray(255), "an all-background picture is kept unchanged");
    }
    Retouch.Picture dot = new Retouch.Picture(new int[] {gray(0)}, 1, 1);
    Retouch.removeBackground(dot);
    check(dot.argb[0] == gray(0), "a 1 x 1 object is kept");
    Retouch.Picture column =
        new Retouch.Picture(new int[] {gray(255), gray(0), gray(255)}, 1, 3);
    Retouch.removeBackground(column);
    check((column.argb[0] >>> 24) == 0 && column.argb[1] == gray(0),
        "a 1-wide cutout clears white and keeps the object");
  }

  private static void stickerFillsWhiteOrClearsWithTheOption() {
    // A near-white (not pure white) background, so the white fill is visible.
    Retouch.Picture white = filled(5, 5, gray(248));
    blackSquare(white);
    Retouch.sticker(white, false);
    check(white.argb[0] == WHITE, "a sticker fills the background opaque white");
    check(white.argb[2 * 5 + 2] == gray(0), "the sticker keeps the object");
    Retouch.Picture clear = filled(5, 5, gray(248));
    blackSquare(clear);
    Retouch.sticker(clear, true);
    check((clear.argb[0] >>> 24) == 0, "the transparent option clears the background");
  }

  private static Retouch.Picture filled(int width, int height, int argb) {
    int[] pixels = new int[width * height];
    java.util.Arrays.fill(pixels, argb);
    return new Retouch.Picture(pixels, width, height);
  }

  /** Paints the centre 3 x 3 of a 5 x 5 picture black, the object a cutout keeps. */
  private static void blackSquare(Retouch.Picture picture) {
    for (int y = 1; y <= 3; y++) {
      for (int x = 1; x <= 3; x++) {
        picture.argb[y * 5 + x] = gray(0);
      }
    }
  }

  private static void thresholdGivesBlackAndWhite() {
    int[] gray = {gray(40), gray(40), gray(200), gray(210)};
    Retouch.threshold(gray);
    for (int pixel : gray) {
      int g = pixel & 0xFF;
      check(g == 0 || g == 255, "threshold gives only black and white: " + g);
      check((pixel >>> 24) == 0xFF, "threshold is opaque");
    }
    check((gray[0] & 0xFF) == 0 && (gray[2] & 0xFF) == 255, "the split keeps the two sides apart");
    check(Retouch.Edit.of("document") == Retouch.Edit.DOCUMENT, "document is known");
    check(!Retouch.Edit.DOCUMENT.isStyle(), "Document is no style");
    int[] down = Retouch.outputSize(Retouch.Edit.DOCUMENT, 3000, 1500, 1920);
    check(down[0] == 1920 && down[1] == 960, "Document fits a wide photo to the page width");
  }

  /** A `size` gray fixture: a `page` rectangle with `margin` of `surface` around it. */
  private static Retouch.Picture pageFixture(int size, int page, int surface, int margin) {
    int[] argb = new int[size * size];
    for (int y = 0; y < size; y++) {
      for (int x = 0; x < size; x++) {
        boolean onPage = x >= margin && x < size - margin && y >= margin && y < size - margin;
        argb[y * size + x] = gray(onPage ? page : surface);
      }
    }
    return new Retouch.Picture(argb, size, size);
  }

  private static void documentFindsThePageQuadEitherContrast() {
    // A bright page on a dark surface, and the inverted case: the finder keys on the edge.
    int[][] bright = Retouch.findPageQuad(pageFixture(40, 220, 40, 8));
    int[][] dark = Retouch.findPageQuad(pageFixture(40, 40, 220, 8));
    for (int[][] quad : new int[][][] {bright, dark}) {
      check(quad != null, "a centred page has a quad whichever side is brighter");
      check(quad[0][0] == 8 && quad[0][1] == 8, "the top-left corner is the page corner");
      check(quad[1][0] == 31 && quad[1][1] == 8, "the top-right corner is the page corner");
      check(quad[2][0] == 31 && quad[2][1] == 31, "the bottom-right corner is the page corner");
      check(quad[3][0] == 8 && quad[3][1] == 31, "the bottom-left corner is the page corner");
    }
  }

  private static void documentWarpsAQuadToAnUprightRectangle() {
    // A rotated quad with a distinct 3 x 3 patch at each corner, on a flat gray field.
    int[] argb = new int[24 * 24];
    java.util.Arrays.fill(argb, gray(128));
    int[][] quad = {{5, 3}, {20, 6}, {18, 20}, {3, 17}};
    int[] mark = {20, 70, 170, 230};
    for (int c = 0; c < 4; c++) {
      patch(argb, 24, quad[c][0], quad[c][1], mark[c]);
    }
    Retouch.Picture warped = Retouch.warpToQuad(new Retouch.Picture(argb, 24, 24), quad);
    check(warped.width == 15 && warped.height == 14, "the output keeps the quad's edge lengths");
    int w = warped.width;
    int h = warped.height;
    check(near(warped.argb[0], mark[0]), "the top-left corner maps to the rectangle");
    check(near(warped.argb[w - 1], mark[1]), "the top-right corner maps to the rectangle");
    check(near(warped.argb[(h - 1) * w + w - 1], mark[2]), "the bottom-right corner maps");
    check(near(warped.argb[(h - 1) * w], mark[3]), "the bottom-left corner maps");
    // A full-frame quad is near the identity: each corner is an edge length (23) apart.
    int[][] whole = {{0, 0}, {23, 0}, {23, 23}, {0, 23}};
    Retouch.Picture same = Retouch.warpToQuad(new Retouch.Picture(argb.clone(), 24, 24), whole);
    check(same.width == 23 && same.height == 23, "a full-frame quad keeps the edge-length size");
    check(near(same.argb[3 * 23 + 5], mark[0]), "a full-frame quad samples near the same place");
  }

  private static void documentCleansWithoutAQuadWhenThePageFillsTheFrame() {
    // The page fills the frame: paper to every edge, a few lines of text, no surrounding surface.
    int[] argb = new int[30 * 30];
    java.util.Arrays.fill(argb, gray(215));
    for (int row : new int[] {12, 15, 18, 21}) {
      for (int x = 8; x < 22; x++) {
        argb[row * 30 + x] = gray(60);
      }
    }
    Retouch.Picture picture = new Retouch.Picture(argb, 30, 30);
    check(Retouch.findPageQuad(picture) == null, "a page that fills the frame has no quad");
    Retouch.Picture cleaned = Retouch.document(picture);
    check(cleaned.width == 30 && cleaned.height == 30, "the clean-only result is not moved");
    for (int pixel : cleaned.argb) {
      int g = pixel & 0xFF;
      check(g == 0 || g == 255, "the clean-only result is black and white: " + g);
    }
  }

  private static void documentScalesDownAndSurvivesTinyPictures() {
    check(Retouch.findPageQuad(new Retouch.Picture(new int[] {gray(90)}, 1, 1)) == null,
        "a 1 x 1 picture has no quad");
    Retouch.apply(Retouch.Edit.DOCUMENT, new Retouch.Picture(new int[] {gray(90)}, 1, 1));
    Retouch.apply(Retouch.Edit.DOCUMENT, new Retouch.Picture(new int[40], 40, 1));
    Retouch.apply(Retouch.Edit.DOCUMENT, new Retouch.Picture(new int[] {gray(10), gray(240),
        gray(10), gray(240)}, 2, 2));
  }

  private static void eraseNeedsItsMarksAndKeepsTheSize() {
    check(Retouch.Edit.of("erase") == Retouch.Edit.ERASE, "erase is known");
    check(!Retouch.Edit.ERASE.isStyle(), "Erase is no style");
    check(java.util.Arrays.equals(Retouch.outputSize(Retouch.Edit.ERASE, 3000, 2000, 1920),
        new int[] {3000, 2000}), "Erase keeps the size, so the marks stay in place");
    try {
      Retouch.apply(Retouch.Edit.ERASE, new Retouch.Picture(new int[] {WHITE}, 1, 1));
      throw new AssertionError("Erase without marks must be refused");
    } catch (IllegalArgumentException expected) {
      // refused: the marks come from the pen, through RetouchModule.erase
    }
  }

  private static void eraseClearsABandAlongAnOpenMark() {
    // A black 200 x 100 picture and one straight mark across it at y = 50.
    Retouch.Picture picture = filled(200, 100, gray(0));
    Retouch.erase(picture, new double[] {20, 50, 180, 50}, new int[] {2});
    int r = (int) Retouch.ERASE_RADIUS;
    check(picture.argb[50 * 200 + 100] == 0x00FFFFFF, "the mark's middle is clear white");
    check(picture.argb[(50 + r - 1) * 200 + 100] == 0x00FFFFFF, "the band is the radius wide");
    check(picture.argb[(50 + r + 2) * 200 + 100] == gray(0), "past the band the picture stays");
    check(picture.argb[50 * 200 + 20 - r + 1] == 0x00FFFFFF, "the band rounds past the first point");
    check(picture.argb[50 * 200 + 2] == gray(0), "far from the mark the picture stays");
    check(picture.argb[5 * 200 + 100] == gray(0), "an open mark erases no inside");
  }

  private static void eraseClearsTheInsideOfAClosedMark() {
    // A circle of radius 60 round (100, 100), drawn as 36 points; its last point meets its first.
    Retouch.Picture picture = filled(200, 200, gray(0));
    double[] xy = circle(100, 100, 60, 36, 1);
    Retouch.erase(picture, xy, new int[] {xy.length / 2});
    check(picture.argb[100 * 200 + 100] == 0x00FFFFFF, "the circle's centre is erased");
    check(picture.argb[100 * 200 + 60] == 0x00FFFFFF, "inside the circle is erased");
    check(picture.argb[5 * 200 + 5] == gray(0), "outside the circle stays");
    // The same points with the last ones dropped leave a gap wider than ERASE_CLOSE: no inside.
    Retouch.Picture open = filled(200, 200, gray(0));
    double[] arc = java.util.Arrays.copyOf(xy, xy.length - 2 * 12);
    Retouch.erase(open, arc, new int[] {arc.length / 2});
    check(open.argb[100 * 200 + 100] == gray(0), "an open arc keeps its centre");
  }

  private static void eraseFillsALoopDrawnTwiceRound() {
    // Two turns of the same circle: the non-zero rule keeps the inside, where even-odd would not.
    Retouch.Picture picture = filled(200, 200, gray(0));
    double[] xy = circle(100, 100, 60, 36, 2);
    Retouch.erase(picture, xy, new int[] {xy.length / 2});
    check(picture.argb[100 * 200 + 100] == 0x00FFFFFF, "a loop drawn twice keeps its inside erased");
  }

  private static void eraseSurvivesTinyPicturesAndMarksOutside() {
    Retouch.Picture one = filled(1, 1, gray(0));
    Retouch.erase(one, new double[] {0.5, 0.5}, new int[] {1});
    check(one.argb[0] == 0x00FFFFFF, "a dot erases a 1 x 1 picture");
    Retouch.Picture wide = filled(40, 1, gray(0));
    Retouch.erase(wide, new double[] {-100, -100, -90, -100}, new int[] {2});
    check(wide.argb[0] == gray(0), "a mark far outside erases nothing");
    Retouch.Picture edge = filled(40, 40, gray(0));
    Retouch.erase(edge, new double[] {-5, 20, -5, 25}, new int[] {2});
    check(edge.argb[20 * 40] == 0x00FFFFFF, "a mark just outside erases the band it reaches");
    Retouch.Picture none = filled(4, 4, gray(0));
    Retouch.erase(none, new double[] {}, new int[] {});
    check(none.argb[0] == gray(0), "no mark erases nothing");
  }

  private static void eraseRefusesBadMarkEnds() {
    int[][] bad = {{3}, {2, 1}, {1}};
    for (int[] ends : bad) {
      try {
        Retouch.eraseMask(10, 10, new double[] {1, 1, 2, 2}, ends, 1);
        throw new AssertionError("mark ends " + java.util.Arrays.toString(ends) + " must be refused");
      } catch (IllegalArgumentException expected) {
        // refused: the ends must be ascending and end at the point count
      }
    }
  }

  /** `turns` turns of a circle as `steps` points each, ending on its first point. */
  private static double[] circle(double cx, double cy, double radius, int steps, int turns) {
    double[] xy = new double[2 * (steps * turns + 1)];
    for (int i = 0; i <= steps * turns; i++) {
      double angle = 2 * Math.PI * i / steps;
      xy[2 * i] = cx + radius * Math.cos(angle);
      xy[2 * i + 1] = cy + radius * Math.sin(angle);
    }
    return xy;
  }

  private static void patch(int[] argb, int size, int cx, int cy, int value) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        int x = cx + dx;
        int y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          argb[y * size + x] = gray(value);
        }
      }
    }
  }

  private static boolean near(int pixel, int value) {
    return Math.abs((pixel & 0xFF) - value) <= 2;
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
