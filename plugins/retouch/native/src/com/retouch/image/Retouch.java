package com.retouch.image;

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
    INVERT;

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
    int left = (picture.width - w) / 2;
    int top = (picture.height - h) / 2;
    int[] out = new int[w * h];
    for (int y = 0; y < h; y++) {
      System.arraycopy(picture.argb, (top + y) * picture.width + left, out, y * w, w);
    }
    return new Picture(out, w, h);
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
   * The output size of an edit: Enhance scales a large picture down to `pageWidth`, never up, so
   * the page stays fast; the others keep the size, which Rotate then swaps itself.
   */
  public static int[] outputSize(Edit edit, int width, int height, int pageWidth) {
    return edit == Edit.ENHANCE
        ? EinkPixels.targetSize(width, height, pageWidth)
        : new int[] {width, height};
  }

  /**
   * Runs `edit` on `picture`, already at {@link #outputSize}, and returns the result: `picture`
   * itself, edited in place, or a new picture for Rotate.
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
      default:
        throw new IllegalArgumentException("unknown edit: " + edit);
    }
  }

  private static int grayPixel(int gray) {
    return OPAQUE | (gray << 16) | (gray << 8) | gray;
  }
}
