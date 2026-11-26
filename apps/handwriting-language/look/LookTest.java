package com.supernotetools.lingo;

import java.awt.image.BufferedImage;
import java.io.File;
import java.util.List;
import javax.imageio.ImageIO;

/**
 * Measures a recorded picture of our own screen (#299): Handwriting Language at the Manta's width, every
 * permission granted, from `renders/`. It fails when the measure stops finding what is drawn: the bar, the
 * rules, a row's pitch, the margins, the switch and the radio ring, each within `Look.TOLERANCE_PX` of
 * the native value, which `Tokens` holds. A picture with none of them is found as «not found».
 * Run as `LookTest FIXTURE.png`.
 */
public final class LookTest {
  private static final float STRETCH = 1.2f;

  private static void check(boolean ok, String message) {
    if (!ok) {
      throw new AssertionError(message);
    }
  }

  public static void main(String[] args) throws Exception {
    BufferedImage picture = ImageIO.read(new File(args[0]));
    List<Look.Finding> findings = Look.measure(picture);
    for (Look.Finding finding : findings) {
      check(finding.ours >= 0, finding.name + " not found");
      check(finding.agrees(), finding.name + ": native " + finding.nativeValue + ", ours " + finding.ours);
    }
    int grey = Look.textGrey(picture, Look.barHeight(picture));
    check(grey == Tokens.CONTEXT_COLOUR, "text grey is " + Integer.toHexString(grey));
    // The same picture stretched taller: a bar and rows that are too tall are reported as differences.
    BufferedImage tall = new BufferedImage(picture.getWidth(), Math.round(picture.getHeight() * STRETCH), BufferedImage.TYPE_INT_RGB);
    java.awt.Graphics2D stretch = tall.createGraphics();
    stretch.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
    stretch.drawImage(picture, 0, 0, tall.getWidth(), tall.getHeight(), null);
    stretch.dispose();
    for (Look.Finding finding : Look.measure(tall)) {
      if (finding.name.equals("Title bar height") || finding.name.equals("Row height, rule to rule")) {
        check(finding.ours >= 0 && !finding.agrees(), finding.name + " of a stretched picture is not reported");
      }
    }
    BufferedImage blank = new BufferedImage(picture.getWidth(), picture.getHeight(), BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < blank.getHeight(); y++) {
      for (int x = 0; x < blank.getWidth(); x++) {
        blank.setRGB(x, y, Tokens.PAPER_COLOUR);
      }
    }
    for (Look.Finding finding : Look.measure(blank)) {
      check(finding.ours < 0, "a blank picture shows " + finding.name);
    }
    System.out.println("LookTest ok: " + findings.size() + " values measured");
  }
}
