package com.retouch.image;

import com.ink2pic.files.Contour;
import com.ink2pic.files.Decolor;
import com.ink2pic.files.EinkPixels;
import java.util.Arrays;

/**
 * Retouch's pixel edits (#136), plain Java on unpremultiplied ARGB pixels with no Android types,
 * so JVM tests run them. Each edit is one tap and gives a finished picture: no slider, since every
 * step on e-ink costs a refresh. Gray that keeps colour contrast and the 16 greys come from
 * Ink2Pic's {@link Decolor} and {@link EinkPixels}; the gamma step and the sharpen are built here,
 * as the reuse check of #138 found no plugin that does them.
 */
public final class Retouch {
  /** Enhance's gamma: above 1 lifts the mid greys, so a dark or faded photo opens up on e-ink. */
  public static final double ENHANCE_GAMMA = 1.2;
  /** One Lighter or Darker tap: the gamma is multiplied or divided by this. */
  public static final double GAMMA_STEP = 1.25;
  /** Enhance's sharpen: the share of the difference from the 3 x 3 mean added back. */
  public static final double SHARPEN_AMOUNT = 0.6;

  /**
   * Erase's band (#134): a pixel whose centre lies within this many picture pixels of a pen mark is
   * cleared, so one pass of the pen erases a stripe about 2.7 mm wide on the Manta.
   * shortcut: a fixed width, since the stroke's `thickness` has no measured unit in pixels; take
   * the pen's width once the device round measures it.
   */
  public static final double ERASE_RADIUS = 16;
  /**
   * A mark whose last point lies within this many pixels of its first closes on itself, so its
   * inside is erased too: circle the part to remove and it goes.
   */
  public static final double ERASE_CLOSE = 48;

  /** Trim's white: a pixel whose red, green and blue are all at least this is margin. */
  public static final int TRIM_WHITE = 240;
  /** Trim's clear: a pixel whose alpha is at most this is margin too. */
  public static final int TRIM_CLEAR = 15;

  /**
   * Document mode's quad finder (#137): the page is confident only when the surface around it is at
   * least this share of the pixels, so a photo whose page fills the frame cleans without a warp.
   */
  public static final double DOCUMENT_MIN_SURFACE = 0.06;
  /** The page region must be at least this share of the pixels, so a speck is never warped. */
  public static final double DOCUMENT_MIN_PAGE = 0.15;
  /**
   * The page must not fill the frame: when more than this share of the border ring is the page
   * class, there is no surrounding surface to straighten against, so the photo is cleaned in place.
   */
  public static final double DOCUMENT_MAX_BORDER_PAGE = 0.65;
  /** The found quad must cover at least this share of the frame, so a thin sliver is not a page. */
  public static final double DOCUMENT_MIN_QUAD = 0.20;
  /**
   * Document mode's surface flood ({@link #groundMask}, #137): the most two neighbouring surface
   * pixels may differ, and the most a surface pixel may differ from the median of the frame's
   * edge. A page edge is a far larger step, and paper is far from a table's median, so neither is
   * flooded; a table lit from one side stays within the drift.
   */
  public static final int DOCUMENT_STEP = 12;
  public static final int DOCUMENT_DRIFT = 64;
  /** Adaptive threshold (#137): the window is a square of this share of the shorter side. */
  public static final int ADAPTIVE_WINDOW_SHARE = 16;
  /** The smallest window radius in pixels, so a small picture still sees whole letters. */
  public static final int ADAPTIVE_MIN_RADIUS = 8;
  /** A pixel this many percent darker than its window's mean is ink. */
  public static final int ADAPTIVE_DARKER = 15;
  /** A gray below this is ink whatever its window, so a large dark area stays dark. */
  public static final int ADAPTIVE_BLACK = 48;

  private static final int MAX = 255;
  private static final int OPAQUE = 0xFF000000;
  /** Make sticker's opaque white card (#134). */
  private static final int WHITE = 0xFFFFFFFF;

  private Retouch() {}

  /** The edits {@link #apply} knows, as the JavaScript side names them. */
  public enum Edit {
    ENHANCE,
    LIGHTER,
    DARKER,
    ROTATE,
    MIRROR,
    FLIP,
    INVERT,
    TRIM,
    // #134: the cutout edits, which keep the object and clear or fill the border background.
    BACKGROUND,
    STICKER,
    // #137: a photographed page straightened and cleaned to black and white on white.
    DOCUMENT,
    // #132: the box the person drew with the pen; it needs that box, so apply refuses it.
    CROP,
    // #134: the marks the person drew with the pen; it needs them, so apply refuses it.
    ERASE,
    // #133: the styles of the grid, each ending on the screen's greys.
    PHOTO,
    LINE_ART,
    BLACK_WHITE,
    DITHER,
    ATKINSON;

    /** Whether this edit is one of the grid's styles (#133). */
    public boolean isStyle() {
      return ordinal() >= PHOTO.ordinal();
    }

    /** The edit for its JavaScript name, such as `enhance`. */
    public static Edit of(String name) {
      for (Edit edit : values()) {
        if (edit.name().equalsIgnoreCase(name)) {
          return edit;
        }
      }
      throw new IllegalArgumentException("unknown edit: " + name);
    }
  }

  /** Pixels and their size; edits that change the size return a new one. */
  public static final class Picture {
    public final int[] argb;
    public final int width;
    public final int height;

    public Picture(int[] argb, int width, int height) {
      if (width < 1 || height < 1 || argb.length != width * height) {
        throw new IllegalArgumentException("bad size " + width + " x " + height);
      }
      this.argb = argb;
      this.width = width;
      this.height = height;
    }
  }

  /**
   * The centre `width` x `height` of `picture`: the lasso preview has a few pixels of margin on
   * each side of the picture (docs/supernote.md, #130). A size at or above the picture's keeps it.
   */
  public static Picture cropCentre(Picture picture, int width, int height) {
    int w = Math.max(1, Math.min(width, picture.width));
    int h = Math.max(1, Math.min(height, picture.height));
    if (w == picture.width && h == picture.height) {
      return picture;
    }
    return crop(picture, new int[] {(picture.width - w) / 2, (picture.height - h) / 2, w, h});
  }

  /** The area `box` ({left, top, width, height}, inside the picture) of `picture`, as a new one. */
  public static Picture crop(Picture picture, int[] box) {
    int left = box[0];
    int top = box[1];
    int w = box[2];
    int h = box[3];
    if (left < 0 || top < 0 || w < 1 || h < 1
        || left + w > picture.width || top + h > picture.height) {
      throw new IllegalArgumentException("the box is outside the picture");
    }
    if (w == picture.width && h == picture.height) {
      return picture;
    }
    int[] out = new int[w * h];
    for (int y = 0; y < h; y++) {
      System.arraycopy(picture.argb, (top + y) * picture.width + left, out, y * w, w);
    }
    return new Picture(out, w, h);
  }

  /**
   * Trim's box (#132), {left, top, width, height}: the smallest area that holds every pixel that is
   * neither near white nor near clear. A picture that is all margin keeps its whole box.
   */
  public static int[] trimBox(Picture picture) {
    int left = picture.width;
    int top = picture.height;
    int right = -1;
    int bottom = -1;
    for (int y = 0; y < picture.height; y++) {
      for (int x = 0; x < picture.width; x++) {
        if (!isMargin(picture.argb[y * picture.width + x])) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return right < 0
        ? new int[] {0, 0, picture.width, picture.height}
        : new int[] {left, top, right - left + 1, bottom - top + 1};
  }

  private static boolean isMargin(int argb) {
    return (argb >>> 24) <= TRIM_CLEAR
        || (((argb >> 16) & MAX) >= TRIM_WHITE
            && ((argb >> 8) & MAX) >= TRIM_WHITE
            && (argb & MAX) >= TRIM_WHITE);
  }

  /** The 256 greys after gamma `gamma`: above 1 lighter, below 1 darker; 0 and 255 stay. */
  public static int[] gammaTable(double gamma) {
    if (!(gamma > 0)) {
      throw new IllegalArgumentException("gamma must be above 0: " + gamma);
    }
    int[] table = new int[MAX + 1];
    for (int g = 0; g <= MAX; g++) {
      table[g] = (int) Math.round(MAX * Math.pow(g / (double) MAX, 1 / gamma));
    }
    return table;
  }

  /** Rewrites gray pixels in place through `table`, which {@link #gammaTable} made. */
  public static void applyTable(int[] gray, int[] table) {
    for (int i = 0; i < gray.length; i++) {
      gray[i] = grayPixel(table[gray[i] & MAX]);
    }
  }

  /**
   * Sharpens gray pixels in place: each gray gets `amount` times its difference from the mean of
   * its 3 x 3 neighbours added, clamped; the edge repeats its nearest pixel. A flat area is
   * unchanged.
   */
  public static void sharpen(int[] gray, int width, int height, double amount) {
    int[] source = new int[gray.length];
    for (int i = 0; i < gray.length; i++) {
      source[i] = gray[i] & MAX;
    }
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        int sum = 0;
        for (int dy = -1; dy <= 1; dy++) {
          int row = Math.max(0, Math.min(height - 1, y + dy)) * width;
          for (int dx = -1; dx <= 1; dx++) {
            sum += source[row + Math.max(0, Math.min(width - 1, x + dx))];
          }
        }
        int centre = source[y * width + x];
        long value = Math.round(centre + amount * (centre - sum / 9.0));
        gray[y * width + x] = grayPixel((int) Math.max(0, Math.min(MAX, value)));
      }
    }
  }

  /** Rewrites gray pixels in place as the nearest of the screen's 16 greys. */
  public static void toGreys(int[] gray) {
    for (int i = 0; i < gray.length; i++) {
      gray[i] = grayPixel(EinkPixels.quantize(gray[i] & MAX));
    }
  }

  /**
   * Enhance for e-ink, in place on `picture`, already at its output size: gray that keeps colour
   * contrast, the gamma step, sharpen, then Ink2Pic's e-ink curve and its 16 greys.
   */
  public static void enhance(Picture picture) {
    Decolor.apply(picture.argb, picture.width, picture.height);
    applyTable(picture.argb, gammaTable(ENHANCE_GAMMA));
    sharpen(picture.argb, picture.width, picture.height, SHARPEN_AMOUNT);
    EinkPixels.toEink(picture.argb, true);
  }

  /**
   * One Lighter or Darker step, in place: the picture is made gray first, as a picture that was
   * never enhanced may still be in colour, then one gamma step and the 16 greys. No contrast curve,
   * so a repeated tap changes only the gamma.
   */
  public static void step(Picture picture, boolean lighter) {
    Decolor.apply(picture.argb, picture.width, picture.height);
    applyTable(picture.argb, gammaTable(lighter ? GAMMA_STEP : 1 / GAMMA_STEP));
    toGreys(picture.argb);
  }

  /** The picture turned 90 degrees clockwise (#131): a new picture, its width and height swapped. */
  public static Picture rotate(Picture picture) {
    int w = picture.width;
    int h = picture.height;
    int[] out = new int[w * h];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        // The source pixel (x, y) lands at column h - 1 - y, row x of the h-wide result.
        out[x * h + (h - 1 - y)] = picture.argb[y * w + x];
      }
    }
    return new Picture(out, h, w);
  }

  /** Mirrors in place, left to right (#131). */
  public static void mirror(Picture picture) {
    int w = picture.width;
    for (int row = 0; row < picture.argb.length; row += w) {
      for (int left = row, right = row + w - 1; left < right; left++, right--) {
        int kept = picture.argb[left];
        picture.argb[left] = picture.argb[right];
        picture.argb[right] = kept;
      }
    }
  }

  /** Mirrors in place, top to bottom (#131). */
  public static void flip(Picture picture) {
    int w = picture.width;
    int[] kept = new int[w];
    for (int top = 0, bottom = picture.height - 1; top < bottom; top++, bottom--) {
      System.arraycopy(picture.argb, top * w, kept, 0, w);
      System.arraycopy(picture.argb, bottom * w, picture.argb, top * w, w);
      System.arraycopy(kept, 0, picture.argb, bottom * w, w);
    }
  }

  /**
   * Inverts each colour in place and keeps its alpha (#131): a dark-mode screenshot becomes dark
   * text on paper. Colour stays colour, as the other geometric edits keep it.
   */
  public static void invert(Picture picture) {
    for (int i = 0; i < picture.argb.length; i++) {
      picture.argb[i] ^= 0x00FFFFFF;
    }
  }

  /**
   * The output size of an edit: Enhance and the styles scale a large picture down to `pageWidth`, never up, so
   * the page stays fast; the others keep the size, which Rotate then swaps itself.
   */
  public static int[] outputSize(Edit edit, int width, int height, int pageWidth) {
    return edit == Edit.ENHANCE || edit == Edit.DOCUMENT || edit.isStyle()
        ? EinkPixels.targetSize(width, height, pageWidth)
        : new int[] {width, height};
  }

  /**
   * Runs `edit` on `picture`, already at {@link #outputSize}, and returns the result: `picture`
   * itself, edited in place, or a new picture for Rotate and Trim.
   */
  public static Picture apply(Edit edit, Picture picture) {
    switch (edit) {
      case ENHANCE:
        enhance(picture);
        return picture;
      case LIGHTER:
      case DARKER:
        step(picture, edit == Edit.LIGHTER);
        return picture;
      case ROTATE:
        return rotate(picture);
      case MIRROR:
        mirror(picture);
        return picture;
      case FLIP:
        flip(picture);
        return picture;
      case INVERT:
        invert(picture);
        return picture;
      case TRIM:
        return crop(picture, trimBox(picture));
      case BACKGROUND:
        removeBackground(picture);
        return picture;
      case STICKER:
        sticker(picture, false);
        return picture;
      case DOCUMENT:
        return document(picture);
      case CROP:
        throw new IllegalArgumentException("crop needs its box: call crop(picture, box)");
      case ERASE:
        throw new IllegalArgumentException("erase needs its marks: call erase(picture, xy, ends)");
      case PHOTO:
      case LINE_ART:
      case BLACK_WHITE:
      case DITHER:
      case ATKINSON:
        style(edit, picture, false, false);
        return picture;
      default:
        throw new IllegalArgumentException("unknown edit: " + edit);
    }
  }

  /**
   * Runs the style `edit` in place on `picture` (#133): Photo, Line art, Black and white, Dither or
   * Atkinson, each on the screen's greys. `thick` widens Line art's lines by one more pixel on each
   * side, so thin strokes stay on e-ink; `transparent` then clears near-white pixels, so the page
   * template shows through.
   */
  public static void style(Edit edit, Picture picture, boolean transparent, boolean thick) {
    int[] argb = picture.argb;
    int w = picture.width;
    int h = picture.height;
    switch (edit) {
      case PHOTO:
        Decolor.apply(argb, w, h);
        EinkPixels.toEink(argb, true);
        break;
      case LINE_ART:
        Contour.apply(argb, w, h);
        if (thick) {
          Contour.thicken(argb, w, h);
        }
        toGreys(argb);
        break;
      case BLACK_WHITE:
        Decolor.apply(argb, w, h);
        threshold(argb);
        break;
      case DITHER:
        Decolor.apply(argb, w, h);
        diffuse(argb, w, h, false);
        break;
      case ATKINSON:
        Decolor.apply(argb, w, h);
        diffuse(argb, w, h, true);
        break;
      default:
        throw new IllegalArgumentException("not a style: " + edit);
    }
    if (transparent) {
      whiteToClear(argb);
    }
  }

  /**
   * Otsu's threshold over gray pixels: the gray at or below which a pixel is black, the split
   * with the largest variance between the two sides. A picture of one gray has no split: the
   * middle gray decides, so a light one stays white and a dark one black.
   */
  public static int otsu(int[] gray) {
    long[] count = new long[MAX + 1];
    for (int pixel : gray) {
      count[pixel & MAX]++;
    }
    long total = gray.length;
    double sumAll = 0;
    for (int g = 0; g <= MAX; g++) {
      sumAll += g * (double) count[g];
    }
    double best = 0;
    int threshold = EinkPixels.MID_GRAY - 1;
    long below = 0;
    double sumBelow = 0;
    for (int t = 0; t < MAX; t++) {
      below += count[t];
      sumBelow += t * (double) count[t];
      long above = total - below;
      if (below == 0 || above == 0) {
        continue;
      }
      double meanBelow = sumBelow / below;
      double meanAbove = (sumAll - sumBelow) / above;
      double between = (double) below * above * (meanBelow - meanAbove) * (meanBelow - meanAbove);
      if (between > best) {
        best = between;
        threshold = t;
      }
    }
    return threshold;
  }

  /** Rewrites gray pixels in place to pure black or white at {@link #otsu}'s split. */
  public static void threshold(int[] gray) {
    int split = otsu(gray);
    for (int i = 0; i < gray.length; i++) {
      gray[i] = grayPixel((gray[i] & MAX) > split ? MAX : 0);
    }
  }

  /**
   * Document mode (#137): straighten a photographed page and clean it to black and white on white.
   * The picture is made gray and its page quad is found ({@link #findPageQuad}); the surface
   * around the page is painted the page's paper gray, so it can never turn black, and the quad is
   * warped to an upright rectangle. The result is cleaned by {@link #adaptiveThreshold}, which
   * follows uneven light, so a lit gray surface or a shaded corner stays white. When no confident
   * quad is found (a photo with no clear page, or a page that fills the frame), it is cleaned in
   * place without a warp, so a mis-detected page is never distorted (Undo and Restore original
   * cover a wrong result). The input is already at {@link #outputSize}, capped at the page width,
   * so the warp output never exceeds it.
   *
   * <p>shortcut: the no-quad fallback cleans without deskewing a rotated page; add a
   * projection-profile deskew if the device round (#137 [device]) finds skewed no-quad photos
   * common.
   */
  public static Picture document(Picture picture) {
    return document(picture, new int[1][][]);
  }

  /** {@link #document}, which also puts the page quad it used, or null, in `found[0]`. */
  public static Picture document(Picture picture, int[][][] found) {
    Decolor.apply(picture.argb, picture.width, picture.height);
    Page page = findPage(picture);
    found[0] = page == null ? null : page.quad;
    Picture out = picture;
    if (page != null) {
      for (int i = 0; i < page.ground.length; i++) {
        if (page.ground[i]) {
          picture.argb[i] = grayPixel(page.paper);
        }
      }
      out = warpToQuad(picture, page.quad);
    }
    adaptiveThreshold(out.argb, out.width, out.height);
    return out;
  }

  /** A page found in a gray picture: its corners, the surface around it and its paper gray. */
  static final class Page {
    final int[][] quad;
    final boolean[] ground;
    final int paper;

    Page(int[][] quad, boolean[] ground, int paper) {
      this.quad = quad;
      this.ground = ground;
      this.paper = paper;
    }
  }

  /**
   * The four page corners {top-left, top-right, bottom-right, bottom-left} of the gray `picture`,
   * each {x, y}, or null when no confident page is found.
   */
  public static int[][] findPageQuad(Picture picture) {
    Page page = findPage(picture);
    return page == null ? null : page.quad;
  }

  /**
   * The page of the gray `picture`, or null. The surface is what {@link #groundMask} floods from
   * the frame's edge: it follows a lighting gradient across the surface, which one global split
   * cannot (#137, beta 8: a white page on a lit gray ground was missed). The page is the largest
   * region the flood leaves, holes and text included; its corners are its pixels farthest along
   * the two diagonals, so a turned or perspective page is found whichever side is brighter. Null
   * when the surface, the page or the quad is too small to trust, or the page reaches most of the
   * frame's edge.
   */
  static Page findPage(Picture picture) {
    int w = picture.width;
    int h = picture.height;
    int total = w * h;
    if (w < 4 || h < 4) {
      return null;
    }
    boolean[] ground =
        groundMask(picture, DOCUMENT_STEP, DOCUMENT_DRIFT, false);
    int[] label = new int[total];
    int[] stack = new int[total];
    int best = 0;
    int bestCount = 0;
    int next = 0;
    for (int start = 0; start < total; start++) {
      if (ground[start] || label[start] != 0) {
        continue;
      }
      next++;
      int count = 0;
      int top = 0;
      label[start] = next;
      stack[top++] = start;
      while (top > 0) {
        int i = stack[--top];
        count++;
        int x = i % w;
        int y = i / w;
        int[] around = {x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1,
            y < h - 1 ? i + w : -1};
        for (int j : around) {
          if (j >= 0 && !ground[j] && label[j] == 0) {
            label[j] = next;
            stack[top++] = j;
          }
        }
      }
      if (count > bestCount) {
        bestCount = count;
        best = next;
      }
    }
    long surface = 0;
    for (boolean g : ground) {
      if (g) {
        surface++;
      }
    }
    if (best == 0 || surface < DOCUMENT_MIN_SURFACE * total || bestCount < DOCUMENT_MIN_PAGE * total) {
      return null;
    }
    // The surface must ring the page: a page that reaches most of the edge fills the frame.
    long ring = 0;
    long ringPage = 0;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        if (x >= 2 && x < w - 2 && y >= 2 && y < h - 2) {
          continue;
        }
        ring++;
        if (label[y * w + x] == best) {
          ringPage++;
        }
      }
    }
    if (ringPage > DOCUMENT_MAX_BORDER_PAGE * ring) {
      return null;
    }
    int tl = -1;
    int tr = -1;
    int br = -1;
    int bl = -1;
    long minSum = Long.MAX_VALUE;
    long maxSum = Long.MIN_VALUE;
    long minDiff = Long.MAX_VALUE;
    long maxDiff = Long.MIN_VALUE;
    int[] histogram = new int[MAX + 1];
    for (int i = 0; i < total; i++) {
      if (label[i] != best) {
        continue;
      }
      histogram[picture.argb[i] & MAX]++;
      long x = i % w;
      long y = i / w;
      if (x + y < minSum) {
        minSum = x + y;
        tl = i;
      }
      if (x + y > maxSum) {
        maxSum = x + y;
        br = i;
      }
      if (x - y > maxDiff) {
        maxDiff = x - y;
        tr = i;
      }
      if (x - y < minDiff) {
        minDiff = x - y;
        bl = i;
      }
    }
    int[][] quad = {point(tl, w), point(tr, w), point(br, w), point(bl, w)};
    if (quadArea(quad) < DOCUMENT_MIN_QUAD * total) {
      return null;
    }
    // The paper is the page's median gray: the text is far less than half of a page.
    int paper = 0;
    for (int seen = 0; paper < MAX && seen + histogram[paper] <= bestCount / 2; paper++) {
      seen += histogram[paper];
    }
    for (int i = 0; i < total; i++) {
      ground[i] = label[i] != best;
    }
    return new Page(quad, ground, paper);
  }

  /**
   * Bradley's adaptive threshold in place over gray pixels: a pixel is black when it is
   * {@link #ADAPTIVE_DARKER} darker than the mean of the square around it, or darker than
   * {@link #ADAPTIVE_BLACK} outright, else white. A flat area, lit or shaded, is white whatever its
   * gray, so uneven light leaves no dark wedge (#137).
   */
  public static void adaptiveThreshold(int[] gray, int w, int h) {
    int radius = Math.max(ADAPTIVE_MIN_RADIUS, Math.min(w, h) / ADAPTIVE_WINDOW_SHARE);
    long[] sums = new long[(w + 1) * (h + 1)];
    for (int y = 0; y < h; y++) {
      long row = 0;
      for (int x = 0; x < w; x++) {
        row += gray[y * w + x] & MAX;
        sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row;
      }
    }
    int[] out = new int[gray.length];
    for (int y = 0; y < h; y++) {
      int ya = Math.max(0, y - radius);
      int yb = Math.min(h, y + radius + 1);
      for (int x = 0; x < w; x++) {
        int xa = Math.max(0, x - radius);
        int xb = Math.min(w, x + radius + 1);
        long sum = sums[yb * (w + 1) + xb] - sums[ya * (w + 1) + xb] - sums[yb * (w + 1) + xa]
            + sums[ya * (w + 1) + xa];
        long area = (long) (xb - xa) * (yb - ya);
        int g = gray[y * w + x] & MAX;
        boolean black = g < ADAPTIVE_BLACK || g * area * 100 < sum * (100 - ADAPTIVE_DARKER);
        out[y * w + x] = grayPixel(black ? 0 : MAX);
      }
    }
    System.arraycopy(out, 0, gray, 0, gray.length);
  }

  private static int[] point(int index, int width) {
    return new int[] {index % width, index / width};
  }

  /**
   * The quad as the log shows it (#137), `x,y` per corner from the top left clockwise, or `none`:
   * a device round reads which page Document found.
   */
  public static String describeQuad(int[][] quad) {
    if (quad == null) {
      return "none";
    }
    StringBuilder text = new StringBuilder();
    for (int[] corner : quad) {
      text.append(text.length() == 0 ? "" : " ").append(corner[0]).append(',').append(corner[1]);
    }
    return text.toString();
  }

  /** The quad's area by the shoelace formula, its corners in order. */
  private static double quadArea(int[][] q) {
    double area = 0;
    for (int i = 0; i < 4; i++) {
      int[] a = q[i];
      int[] b = q[(i + 1) % 4];
      area += (double) a[0] * b[1] - (double) b[0] * a[1];
    }
    return Math.abs(area) / 2;
  }

  /**
   * The gray `picture` warped so its `quad` {top-left, top-right, bottom-right, bottom-left}
   * becomes an upright rectangle, by bilinear sampling of the source for each output pixel. The
   * output keeps the page's aspect from the longer of each pair of opposite quad edges; a pixel
   * whose source falls outside the picture is white, so the background is clean.
   */
  public static Picture warpToQuad(Picture picture, int[][] quad) {
    int[] tl = quad[0];
    int[] tr = quad[1];
    int[] br = quad[2];
    int[] bl = quad[3];
    int outW = Math.max(1, (int) Math.round(Math.max(dist(tl, tr), dist(bl, br))));
    int outH = Math.max(1, (int) Math.round(Math.max(dist(tl, bl), dist(tr, br))));
    // The homography mapping output (u, v) back to the source, so each output pixel samples once.
    double[] hgy =
        homography(outW - 1, outH - 1, tl, tr, br, bl);
    int[] out = new int[outW * outH];
    for (int v = 0; v < outH; v++) {
      for (int u = 0; u < outW; u++) {
        double denom = hgy[6] * u + hgy[7] * v + 1;
        double sx = (hgy[0] * u + hgy[1] * v + hgy[2]) / denom;
        double sy = (hgy[3] * u + hgy[4] * v + hgy[5]) / denom;
        out[v * outW + u] = sample(picture, sx, sy);
      }
    }
    return new Picture(out, outW, outH);
  }

  private static double dist(int[] a, int[] b) {
    double dx = a[0] - b[0];
    double dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * The 8 coefficients {a..h} of the homography that maps output (u, v) in the (maxU x maxV)
   * rectangle to the source quad corners, so x = (au + bv + c) / (gu + hv + 1) and likewise for y.
   * Solved from the four corner pairs by Gaussian elimination.
   */
  static double[] homography(int maxU, int maxV, int[] tl, int[] tr, int[] br, int[] bl) {
    int[][] dst = {{0, 0}, {maxU, 0}, {maxU, maxV}, {0, maxV}};
    int[][] src = {tl, tr, br, bl};
    double[][] a = new double[8][9];
    for (int i = 0; i < 4; i++) {
      double u = dst[i][0];
      double v = dst[i][1];
      double x = src[i][0];
      double y = src[i][1];
      a[i * 2] = new double[] {u, v, 1, 0, 0, 0, -u * x, -v * x, x};
      a[i * 2 + 1] = new double[] {0, 0, 0, u, v, 1, -u * y, -v * y, y};
    }
    return solve(a);
  }

  /** Solves the 8 x 9 augmented system by Gaussian elimination with partial pivoting. */
  private static double[] solve(double[][] a) {
    int n = 8;
    for (int col = 0; col < n; col++) {
      int pivot = col;
      for (int row = col + 1; row < n; row++) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
          pivot = row;
        }
      }
      double[] swap = a[col];
      a[col] = a[pivot];
      a[pivot] = swap;
      double head = a[col][col];
      if (Math.abs(head) < 1e-9) {
        continue;
      }
      for (int row = 0; row < n; row++) {
        if (row == col) {
          continue;
        }
        double factor = a[row][col] / head;
        for (int k = col; k <= n; k++) {
          a[row][k] -= factor * a[col][k];
        }
      }
    }
    double[] result = new double[n];
    for (int i = 0; i < n; i++) {
      result[i] = Math.abs(a[i][i]) < 1e-9 ? 0 : a[i][n] / a[i][i];
    }
    return result;
  }

  /** The gray value at source (sx, sy) by bilinear sampling, or white outside the picture. */
  private static int sample(Picture picture, double sx, double sy) {
    int w = picture.width;
    int h = picture.height;
    if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) {
      return WHITE;
    }
    int x0 = (int) Math.floor(sx);
    int y0 = (int) Math.floor(sy);
    int x1 = Math.min(x0 + 1, w - 1);
    int y1 = Math.min(y0 + 1, h - 1);
    double fx = sx - x0;
    double fy = sy - y0;
    int g00 = picture.argb[y0 * w + x0] & MAX;
    int g10 = picture.argb[y0 * w + x1] & MAX;
    int g01 = picture.argb[y1 * w + x0] & MAX;
    int g11 = picture.argb[y1 * w + x1] & MAX;
    double top = g00 + (g10 - g00) * fx;
    double bottom = g01 + (g11 - g01) * fx;
    int gray = (int) Math.round(top + (bottom - top) * fy);
    return grayPixel(Math.max(0, Math.min(MAX, gray)));
  }

  /**
   * Error diffusion in place over gray pixels: Floyd-Steinberg to the 16 greys, or, with
   * `atkinson`, Atkinson to black and white, which spreads only 6/8 of the error and so keeps
   * light areas clean.
   */
  public static void diffuse(int[] gray, int w, int h, boolean atkinson) {
    int[] value = new int[gray.length];
    for (int i = 0; i < gray.length; i++) {
      value[i] = gray[i] & MAX;
    }
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int i = y * w + x;
        int old = Math.max(0, Math.min(MAX, value[i]));
        int level = atkinson ? (old < EinkPixels.MID_GRAY ? 0 : MAX) : EinkPixels.quantize(old);
        gray[i] = grayPixel(level);
        int error = old - level;
        if (atkinson) {
          int share = error / 8;
          spread(value, w, h, x + 1, y, share);
          spread(value, w, h, x + 2, y, share);
          spread(value, w, h, x - 1, y + 1, share);
          spread(value, w, h, x, y + 1, share);
          spread(value, w, h, x + 1, y + 1, share);
          spread(value, w, h, x, y + 2, share);
        } else {
          spread(value, w, h, x + 1, y, error * 7 / 16);
          spread(value, w, h, x - 1, y + 1, error * 3 / 16);
          spread(value, w, h, x, y + 1, error * 5 / 16);
          spread(value, w, h, x + 1, y + 1, error / 16);
        }
      }
    }
  }

  private static void spread(int[] value, int w, int h, int x, int y, int error) {
    if (x >= 0 && x < w && y < h) {
      value[y * w + x] += error;
    }
  }

  /**
   * The border-connected background (#134): every pixel reachable from the four borders through
   * pixels {@link #isMargin} judges near white or near clear ({@link #groundMask} with no drift).
   * An object that reaches a border blocks the flood, so it is kept; a near-white hole inside the
   * object is never reached, so it is kept too.
   */
  public static boolean[] backgroundMask(Picture picture) {
    return groundMask(picture, 0, -1, true);
  }

  /**
   * The surface around the subject, flooded from the frame's edge (#134, #137). The surface is
   * every pixel within `drift` of the edge's median colour (in each channel) that the flood
   * reaches: an edge pixel starts it, and it goes on to a neighbour that differs by at most `step`,
   * raw or in a 3 x 3 blur that hides photo noise. Clear pixels, and with `nearWhite` near-white
   * ones, always belong. So the flood follows a gradient of light or a soft shadow and stops at the
   * subject's sharper edge; the drift is judged raw and against one colour, so neither a blur nor
   * the order of the flood carries it over an edge. Each pixel is pushed at most once.
   */
  public static boolean[] groundMask(Picture picture, int step, int drift, boolean nearWhite) {
    int w = picture.width;
    int h = picture.height;
    int[] raw = picture.argb;
    int[] argb = blur3(raw, w, h);
    int n = argb.length;
    boolean[] bg = new boolean[n];
    int[] stack = new int[n];
    int top = 0;
    int median = edgeMedian(raw, w, h);
    int[] edge = new int[2 * (w + h)];
    int count = 0;
    for (int x = 0; x < w; x++) {
      edge[count++] = x;
      edge[count++] = (h - 1) * w + x;
    }
    for (int y = 0; y < h; y++) {
      edge[count++] = y * w;
      edge[count++] = y * w + (w - 1);
    }
    for (int k = 0; k < count; k++) {
      int i = edge[k];
      if (!bg[i]
          && (isClear(raw[i]) || (nearWhite && isMargin(raw[i])) || distance(raw[i], median) <= drift)) {
        bg[i] = true;
        stack[top++] = i;
      }
    }
    while (top > 0) {
      int i = stack[--top];
      int x = i % w;
      int y = i / w;
      int[] around = {x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1,
          y < h - 1 ? i + w : -1};
      for (int j : around) {
        if (j < 0 || bg[j]) {
          continue;
        }
        boolean follows = isClear(raw[j])
            || (nearWhite && isMargin(raw[j]))
            || (Math.min(distance(argb[j], argb[i]), distance(raw[j], raw[i])) <= step
                && distance(raw[j], median) <= drift);
        if (follows) {
          bg[j] = true;
          stack[top++] = j;
        }
      }
    }
    return bg;
  }

  private static boolean isClear(int argb) {
    return (argb >>> 24) <= TRIM_CLEAR;
  }

  /** The largest difference of two colours over their red, green and blue. */
  private static int distance(int a, int b) {
    int dr = Math.abs(((a >> 16) & MAX) - ((b >> 16) & MAX));
    int dg = Math.abs(((a >> 8) & MAX) - ((b >> 8) & MAX));
    int db = Math.abs((a & MAX) - (b & MAX));
    return Math.max(dr, Math.max(dg, db));
  }

  /** Each channel's median over the frame's edge pixels, as one opaque colour. */
  private static int edgeMedian(int[] argb, int w, int h) {
    int[][] histogram = new int[3][MAX + 1];
    int count = 0;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
          continue;
        }
        int c = argb[y * w + x];
        histogram[0][(c >> 16) & MAX]++;
        histogram[1][(c >> 8) & MAX]++;
        histogram[2][c & MAX]++;
        count++;
      }
    }
    int colour = OPAQUE;
    for (int channel = 0; channel < 3; channel++) {
      int value = 0;
      for (int seen = 0; value < MAX && seen + histogram[channel][value] <= count / 2; value++) {
        seen += histogram[channel][value];
      }
      colour |= value << (16 - 8 * channel);
    }
    return colour;
  }

  /** A 3 x 3 box blur of each colour channel, so photo noise does not break a flood. */
  private static int[] blur3(int[] argb, int w, int h) {
    int[] out = new int[argb.length];
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int r = 0;
        int g = 0;
        int b = 0;
        int k = 0;
        for (int yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
          for (int xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
            int c = argb[yy * w + xx];
            r += (c >> 16) & MAX;
            g += (c >> 8) & MAX;
            b += c & MAX;
            k++;
          }
        }
        out[y * w + x] = (argb[y * w + x] & 0xFF000000) | ((r / k) << 16) | ((g / k) << 8) | (b / k);
      }
    }
    return out;
  }

  /**
   * Whether `bg` leaves any pixel for the object: a picture that is all background (a mis-lassoed
   * near-white area) has none, and the cutout edits then keep it rather than blank it.
   */
  private static boolean hasObject(boolean[] bg) {
    for (boolean background : bg) {
      if (!background) {
        return true;
      }
    }
    return false;
  }

  /**
   * Background removal (#134): clears the border-connected background to transparent, in place, so
   * the page shows through. A picture with no object is kept unchanged.
   */
  public static void removeBackground(Picture picture) {
    boolean[] bg = backgroundMask(picture);
    if (!hasObject(bg)) {
      return;
    }
    for (int i = 0; i < bg.length; i++) {
      if (bg[i]) {
        picture.argb[i] &= 0x00FFFFFF;
      }
    }
  }

  /**
   * Make sticker (#134): the cutout on an opaque white card, or on a transparent background with
   * `transparent`, in place. A picture with no object is kept unchanged.
   */
  public static void sticker(Picture picture, boolean transparent) {
    boolean[] bg = backgroundMask(picture);
    if (!hasObject(bg)) {
      return;
    }
    for (int i = 0; i < bg.length; i++) {
      if (bg[i]) {
        picture.argb[i] = transparent ? (picture.argb[i] & 0x00FFFFFF) : WHITE;
      }
    }
  }

  /**
   * Erase with the pen (#134), in place: every pixel {@link #eraseMask} marks becomes clear white,
   * so the page shows through and a reader that ignores alpha still sees paper.
   */
  public static void erase(Picture picture, double[] xy, int[] ends) {
    boolean[] mask = eraseMask(picture.width, picture.height, xy, ends, ERASE_RADIUS);
    for (int i = 0; i < mask.length; i++) {
      if (mask[i]) {
        picture.argb[i] = 0x00FFFFFF;
      }
    }
  }

  /**
   * The pixels the pen marks erase on a `width` x `height` picture (#134). `xy` holds x, y of every
   * point in turn, in the picture's pixels; `ends` the point count after each mark, ascending, the
   * last one every point. A pixel is erased when its centre lies within `radius` of a mark, and
   * inside a mark that closes on itself ({@link #ERASE_CLOSE}), by the non-zero rule, so a loop
   * drawn twice round stays filled. A point outside the picture still erases the band it reaches.
   */
  public static boolean[] eraseMask(int width, int height, double[] xy, int[] ends, double radius) {
    if (width < 1 || height < 1 || xy.length % 2 != 0 || !(radius >= 0)) {
      throw new IllegalArgumentException("bad erase input");
    }
    boolean[] mask = new boolean[width * height];
    int start = 0;
    for (int end : ends) {
      if (end < start || end > xy.length / 2) {
        throw new IllegalArgumentException("the mark ends are not ascending inside the points");
      }
      if (end > start) {
        band(mask, width, height, xy, start, end, radius);
        if (end - start >= 3
            && Math.hypot(xy[2 * start] - xy[2 * (end - 1)], xy[2 * start + 1] - xy[2 * (end - 1) + 1])
                <= ERASE_CLOSE) {
          fillInside(mask, width, height, xy, start, end);
        }
      }
      start = end;
    }
    if (start != xy.length / 2) {
      throw new IllegalArgumentException("the last mark end is not the point count");
    }
    return mask;
  }

  /** Marks every pixel whose centre lies within `radius` of the mark's points `start` to `end`. */
  private static void band(
      boolean[] mask, int w, int h, double[] xy, int start, int end, double radius) {
    for (int k = start; k < end; k++) {
      int next = Math.min(k + 1, end - 1);
      double ax = xy[2 * k];
      double ay = xy[2 * k + 1];
      double bx = xy[2 * next];
      double by = xy[2 * next + 1];
      int x0 = Math.max(0, (int) Math.floor(Math.min(ax, bx) - radius));
      int x1 = Math.min(w - 1, (int) Math.ceil(Math.max(ax, bx) + radius));
      int y0 = Math.max(0, (int) Math.floor(Math.min(ay, by) - radius));
      int y1 = Math.min(h - 1, (int) Math.ceil(Math.max(ay, by) + radius));
      double dx = bx - ax;
      double dy = by - ay;
      double length2 = dx * dx + dy * dy;
      for (int y = y0; y <= y1; y++) {
        for (int x = x0; x <= x1; x++) {
          double px = x + 0.5 - ax;
          double py = y + 0.5 - ay;
          double t = length2 == 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length2));
          double ex = px - t * dx;
          double ey = py - t * dy;
          if (ex * ex + ey * ey <= radius * radius) {
            mask[y * w + x] = true;
          }
        }
      }
    }
  }

  /**
   * Marks every pixel whose centre lies inside the closed mark `start` to `end` (its last point
   * joined back to its first) by the non-zero winding rule, one scanline per pixel row.
   */
  private static void fillInside(boolean[] mask, int w, int h, double[] xy, int start, int end) {
    int count = end - start;
    // Crossings of the row by edges going down and going up, each sorted on its own: the walk
    // merges them, so a scribble with many crossings sorts as fast as a plain loop.
    double[] downs = new double[count];
    double[] ups = new double[count];
    for (int y = 0; y < h; y++) {
      double cy = y + 0.5;
      int down = 0;
      int up = 0;
      for (int k = 0; k < count; k++) {
        int a = start + k;
        int b = start + (k + 1) % count;
        double ay = xy[2 * a + 1];
        double by = xy[2 * b + 1];
        boolean goesDown = ay <= cy && by > cy;
        if (!goesDown && !(by <= cy && ay > cy)) {
          continue;
        }
        double x = xy[2 * a] + (cy - ay) / (by - ay) * (xy[2 * b] - xy[2 * a]);
        if (goesDown) {
          downs[down++] = x;
        } else {
          ups[up++] = x;
        }
      }
      Arrays.sort(downs, 0, down);
      Arrays.sort(ups, 0, up);
      int winding = 0;
      double from = 0;
      for (int i = 0, j = 0; i < down || j < up; ) {
        boolean takeDown = j >= up || (i < down && downs[i] <= ups[j]);
        double x = takeDown ? downs[i++] : ups[j++];
        int before = winding;
        winding += takeDown ? 1 : -1;
        if (before == 0) {
          from = x;
        } else if (winding == 0) {
          fillRow(mask, w, y, from, x);
        }
      }
    }
  }

  /** Marks row `y`'s pixels whose centre x + 0.5 lies in [from, to). */
  private static void fillRow(boolean[] mask, int w, int y, double from, double to) {
    int first = Math.max(0, (int) Math.ceil(from - 0.5));
    int last = Math.min(w, (int) Math.ceil(to - 0.5));
    for (int x = first; x < last; x++) {
      mask[y * w + x] = true;
    }
  }

  /** White to transparent (#133): a pixel at or above {@link #TRIM_WHITE} becomes clear. */
  public static void whiteToClear(int[] argb) {
    for (int i = 0; i < argb.length; i++) {
      if ((argb[i] & MAX) >= TRIM_WHITE) {
        argb[i] &= 0x00FFFFFF;
      }
    }
  }

  private static int grayPixel(int gray) {
    return OPAQUE | (gray << 16) | (gray << 8) | gray;
  }
}
