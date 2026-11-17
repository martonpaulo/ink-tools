package com.retouch.image;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;

/**
 * Synthetic phone photos for the JVM tests (#137): no real photo is committed, so each one
 * is drawn here from a fixed seed, with the faults the device round saw, and sent through a JPEG
 * round trip so the edges and the noise are a camera's, not a drawing's.
 */
final class PhotoFixtures {
  private PhotoFixtures() {}

  /** The page of {@link #skewedPage}, in its own pixels: a portrait sheet. */
  static final int PAGE_W = 360;
  static final int PAGE_H = 480;
  /** How far inside the sheet its printed border runs, and how thick it is. */
  static final int BORDER_INSET = 14;
  static final int BORDER = 3;
  /**
   * Where the sheet's corners {top-left, top-right, bottom-right, bottom-left} land in the photo:
   * about 7° of tilt with the top edge rising to the right, and a trapezoid from the camera's
   * angle, as on the device round of #137 (beta 8).
   */
  static final int[][] PAGE_QUAD = {{120, 150}, {470, 105}, {515, 640}, {100, 655}};
  static final int PHOTO_W = 620;
  static final int PHOTO_H = 760;

  /**
   * A white sheet with a printed border and three lines of text, turned in perspective on a gray
   * table lit from the right: darker on the left (about 100) than on the right (about 195). One
   * global split puts the lit side with the paper, so beta 8 found no page and turned the dark
   * side into a black wedge.
   */
  static Retouch.Picture skewedPage() {
    double[] toPhoto = Retouch.homography(PAGE_W, PAGE_H, PAGE_QUAD[0], PAGE_QUAD[1],
        PAGE_QUAD[2], PAGE_QUAD[3]);
    double[] toPage = invert(toPhoto);
    Random noise = new Random(137);
    int[] argb = new int[PHOTO_W * PHOTO_H];
    for (int y = 0; y < PHOTO_H; y++) {
      for (int x = 0; x < PHOTO_W; x++) {
        double sum = 0;
        for (int sy = 0; sy < 3; sy++) {
          for (int sx = 0; sx < 3; sx++) {
            double px = x + (sx + 0.5) / 3;
            double py = y + (sy + 0.5) / 3;
            double[] uv = apply(toPage, px, py);
            sum += onSheet(uv[0], uv[1]) ? sheet(uv[0], uv[1]) : table(px, py);
          }
        }
        int g = (int) Math.round(sum / 9 + noise.nextGaussian() * 3);
        argb[y * PHOTO_W + x] = gray(g);
      }
    }
    return jpeg(new Retouch.Picture(argb, PHOTO_W, PHOTO_H));
  }

  private static boolean onSheet(double u, double v) {
    return u >= 0 && v >= 0 && u < PAGE_W && v < PAGE_H;
  }

  /** The table's gray at a photo point: the light comes from the right. */
  private static double table(double x, double y) {
    return 100 + 88 * x / PHOTO_W + 8 * y / PHOTO_H;
  }

  /** The sheet's gray at a sheet point: paper, the border, or a word of text. */
  private static double sheet(double u, double v) {
    double paper = 236 - 10 * (PAGE_W - u) / PAGE_W;
    boolean border = inside(u, v, BORDER_INSET) && !inside(u, v, BORDER_INSET + BORDER);
    boolean text = false;
    for (int line = 0; line < 3; line++) {
      double top = 80 + line * 40;
      if (v >= top && v < top + 12) {
        // Words of a few widths, with gaps, inside the border.
        double x = u - 40;
        text = x >= 0 && u < PAGE_W - 40 && (x % 70) < 52 - 12 * (line % 2);
      }
    }
    return border || text ? 40 : paper;
  }

  /** Whether a sheet point lies `inset` or more inside every edge of the sheet. */
  private static boolean inside(double u, double v, int inset) {
    return u >= inset && v >= inset && u < PAGE_W - inset && v < PAGE_H - inset;
  }

  /** The 3 x 3 inverse of a homography's 8 coefficients, scaled so its last term is 1. */
  private static double[] invert(double[] m) {
    double a = m[0];
    double b = m[1];
    double c = m[2];
    double d = m[3];
    double e = m[4];
    double f = m[5];
    double g = m[6];
    double h = m[7];
    double i = 1;
    double[] inv = {e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g,
        c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d};
    double s = inv[8];
    for (int k = 0; k < 9; k++) {
      inv[k] /= s;
    }
    return inv;
  }

  /** A homography of 8 or 9 coefficients applied to (x, y). */
  static double[] apply(double[] m, double x, double y) {
    double w = m[6] * x + m[7] * y + (m.length > 8 ? m[8] : 1);
    return new double[] {(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w};
  }

  /** The picture after a JPEG save and load at a phone's quality. */
  private static Retouch.Picture jpeg(Retouch.Picture picture) {
    try {
      BufferedImage image =
          new BufferedImage(picture.width, picture.height, BufferedImage.TYPE_INT_RGB);
      image.setRGB(0, 0, picture.width, picture.height, picture.argb, 0, picture.width);
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
      ImageWriteParam param = writer.getDefaultWriteParam();
      param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
      param.setCompressionQuality(0.85f);
      writer.setOutput(ImageIO.createImageOutputStream(bytes));
      writer.write(null, new IIOImage(image, null, null), param);
      writer.dispose();
      BufferedImage back = ImageIO.read(new ByteArrayInputStream(bytes.toByteArray()));
      int[] argb = back.getRGB(0, 0, picture.width, picture.height, null, 0, picture.width);
      return new Retouch.Picture(argb, picture.width, picture.height);
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }

  private static int clamp(int v) {
    return Math.max(0, Math.min(255, v));
  }

  static int gray(int g) {
    return rgb(g, g, g);
  }

  private static int rgb(int r, int g, int b) {
    return 0xFF000000 | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
  }
}
