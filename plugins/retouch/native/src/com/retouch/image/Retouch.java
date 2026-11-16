package com.retouch.image;

import com.ink2pic.files.Contour;
import com.ink2pic.files.Decolor;
import com.ink2pic.files.EinkPixels;

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

  /** Trim's white: a pixel whose red, green and blue are all at least this is margin. */
  public static final int TRIM_WHITE = 240;
  /** Trim's clear: a pixel whose alpha is at most this is margin too. */
  public static final int TRIM_CLEAR = 15;

  private static final int MAX = 255;
  private static final int OPAQUE = 0xFF000000;

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
    return edit == Edit.ENHANCE || edit.isStyle()
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
        int threshold = otsu(argb);
        for (int i = 0; i < argb.length; i++) {
          argb[i] = grayPixel((argb[i] & MAX) > threshold ? MAX : 0);
        }
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
