package com.supernotetools.lingo;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;
import javax.imageio.ImageIO;

/**
 * `node scripts/look-check.cjs` (#299): measures a screen's picture against the native look
 * (`Look`), prints each difference with the native value and ours, and draws one sheet: our
 * picture with its rules marked, the native rhythm drawn from the catalog's values (or the
 * native screen's own picture when one is given), and the table of differences.
 *
 *   LookSheet --screen NAME --ours OURS.png --out SHEET.png [--native NATIVE.png]
 */
final class LookSheet {
  private static final int PANEL_WIDTH = 940;
  private static final int GAP = 40;
  private static final int HEADER = 124;
  private static final int TABLE_WIDTH = 1000;
  private static final int ROW_STEP = 44;
  private static final int TEXT_SIZE = 22;
  private static final int SMALL_TEXT_SIZE = 16;
  private static final int TITLE_SIZE = 30;
  private static final String FONT = "SansSerif";
  private static final Color PAPER = Color.WHITE;
  private static final Color INK = Color.BLACK;
  private static final Color OURS_MARK = new Color(0xd0021b);
  private static final Color AGREE = new Color(0x1b7f37);
  private static final Color HATCH = new Color(0xdddddd);
  private static final Color FRAME = new Color(0x888888);
  private static final float THIN = 1f;
  private static final float SOLID_RULE = 2f;
  private static final float[] LIGHT_DOTS = {2f, 2f};
  private static final float DOT_PHASE = 0f;
  private static final int LABEL_WIDTH = 64;
  private static final int HALF = 2;
  private static final int NAME_X = 112;
  private static final int RGB_BITS = 0xffffff;
  private static final float DASH = 6f;
  private static final float[] DOTS = {DASH, DASH};
  private static final int LABEL_INSET = 12;
  private static final int CAPTION_GAP = 12;
  private static final String NATIVE_RELATED = "Native: Settings pages, packages/ui-kit/native-catalog.md";
  /** The most a measured picture's panel is scaled up: a picture narrower than the panel is not stretched. */
  private static final float MAX_SCALE = 1f;

  private LookSheet() {}

  public static void main(String[] args) throws IOException {
    String screen = null;
    File ours = null;
    File nativeFile = null;
    File out = null;
    for (int i = 0; i + 1 < args.length; i += 2) {
      switch (args[i]) {
        case "--screen": screen = args[i + 1]; break;
        case "--ours": ours = new File(args[i + 1]); break;
        case "--native": nativeFile = new File(args[i + 1]); break;
        case "--out": out = new File(args[i + 1]); break;
        default: throw new IllegalArgumentException("unknown option " + args[i]);
      }
    }
    if (screen == null || ours == null || out == null) {
      throw new IllegalArgumentException("usage: LookSheet --screen NAME --ours OURS.png --out SHEET.png [--native NATIVE.png]");
    }
    BufferedImage ourPicture = read(ours);
    BufferedImage nativePicture = nativeFile == null ? null : read(nativeFile);
    List<Look.Finding> ourFindings = Look.measure(ourPicture);
    List<Look.Finding> nativeFindings = nativePicture == null ? null : Look.measure(nativePicture);
    List<Look.Finding> findings = nativeFindings == null ? ourFindings : against(ourFindings, nativeFindings);
    for (Look.Finding finding : findings) {
      System.out.println(String.format("%-10s", finding.verdict()) + describe(finding));
    }
    ImageIO.write(sheet(screen, ourPicture, nativePicture, findings), "png", out);
    System.out.println("look-check: " + out);
  }

  private static BufferedImage read(File file) throws IOException {
    BufferedImage picture = ImageIO.read(file);
    if (picture == null) {
      throw new IOException("not a PNG picture: " + file);
    }
    return picture;
  }

  /** The findings of our picture with the native picture's own measures as the native values. */
  private static List<Look.Finding> against(List<Look.Finding> ours, List<Look.Finding> natives) {
    List<Look.Finding> found = new java.util.ArrayList<>();
    for (int i = 0; i < ours.size(); i++) {
      found.add(new Look.Finding(ours.get(i).name, ours.get(i).unit, natives.get(i).ours, ours.get(i).ours, ours.get(i).note));
    }
    return found;
  }

  private static String describe(Look.Finding finding) {
    String ours = finding.ours < 0 ? "not found" : Math.round(finding.ours) + " " + finding.unit;
    String nativeText = finding.nativeFound() ? Math.round(finding.nativeValue) + " " + finding.unit : "not found";
    return finding.name + ": native " + nativeText + ", ours " + ours
        + (finding.note.isEmpty() ? "" : " (" + finding.note + ")");
  }

  private static BufferedImage sheet(String screen, BufferedImage ours, BufferedImage nativePicture, List<Look.Finding> findings) {
    float scale = Math.min(MAX_SCALE, PANEL_WIDTH / (float) ours.getWidth());
    int panelHeight = Math.round(ours.getHeight() * scale);
    int width = GAP + PANEL_WIDTH + GAP + PANEL_WIDTH + GAP + TABLE_WIDTH + GAP;
    int height = HEADER + panelHeight + GAP;
    BufferedImage sheet = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = sheet.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
    g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    g.setColor(PAPER);
    g.fillRect(0, 0, width, height);
    g.setColor(INK);
    g.setFont(new Font(FONT, Font.BOLD, TITLE_SIZE));
    g.drawString(screen + ": ours, the native look, and the differences", GAP, GAP);
    g.setFont(new Font(FONT, Font.PLAIN, SMALL_TEXT_SIZE));
    g.drawString("Pixels of the 299 ppi Manta, 11.8 px per mm. Red: our rules and their pitch.", GAP, GAP + TITLE_SIZE);

    int oursX = GAP;
    g.drawImage(ours, oursX, HEADER, PANEL_WIDTH, panelHeight, null);
    g.setColor(FRAME);
    g.drawRect(oursX, HEADER, PANEL_WIDTH, panelHeight);
    List<Look.Rule> rules = Look.rules(ours, Look.barHeight(ours));
    markRules(g, rules, oursX, scale, Look.barHeight(ours));
    caption(g, "Ours", oursX);

    int nativeX = oursX + PANEL_WIDTH + GAP;
    if (nativePicture == null) {
      drawModel(g, rules, ours.getHeight(), Look.barHeight(ours), nativeX, scale);
      caption(g, "Native rhythm, from the catalog's values", nativeX);
    } else {
      float nativeScale = Math.min(MAX_SCALE, PANEL_WIDTH / (float) nativePicture.getWidth());
      g.drawImage(nativePicture, nativeX, HEADER, PANEL_WIDTH, Math.round(nativePicture.getHeight() * nativeScale), null);
      caption(g, "Native screen", nativeX);
    }
    drawTable(g, findings, ours, oursX + PANEL_WIDTH + GAP + PANEL_WIDTH + GAP);
    g.dispose();
    return sheet;
  }

  private static void caption(Graphics2D g, String text, int x) {
    g.setColor(INK);
    g.setFont(new Font(FONT, Font.BOLD, TEXT_SIZE));
    g.drawString(text, x, HEADER - CAPTION_GAP);
  }

  /** A red line at each rule of our picture, with the pitch from the rule above, at the trailing side. */
  private static void markRules(Graphics2D g, List<Look.Rule> rules, int x, float scale, int bar) {
    g.setFont(new Font(FONT, Font.BOLD, SMALL_TEXT_SIZE));
    int before = bar;
    for (Look.Rule rule : rules) {
      int y = HEADER + Math.round(rule.y * scale);
      g.setColor(OURS_MARK);
      g.setStroke(new BasicStroke(THIN));
      g.drawLine(x, y, x + PANEL_WIDTH, y);
      g.drawString((rule.y - before) + " px", x + PANEL_WIDTH - LABEL_INSET - LABEL_WIDTH, y - 2);
      before = rule.y;
    }
  }

  /**
   * The native rhythm: the black bar at the native height, then one band per gap between our
   * rules, a native row where ours is a row, ours unchanged where it is not (a note, a command),
   * hatched, with the native side margins drawn as dotted lines.
   */
  private static void drawModel(Graphics2D g, List<Look.Rule> rules, int height, int oursBar, int x, float scale) {
    int bar = Look.px(Tokens.TITLE_BAR_HEIGHT_MM);
    int row = Look.px(Tokens.ROW_HEIGHT_MM);
    int captionRow = row + Look.px(Tokens.CAPTION_HEIGHT_MM);
    g.setColor(INK);
    g.fillRect(x, HEADER, PANEL_WIDTH, Math.round(bar * scale));
    int top = bar;
    for (int i = 0; i < rules.size(); i++) {
      Look.Rule rule = rules.get(i);
      int previous = i == 0 ? oursBar : rules.get(i - 1).y;
      int pitch = rule.y - previous;
      boolean isCaption = Look.isCaptionRowPitch(pitch);
      boolean isRow = Look.isRowPitch(pitch) || isCaption;
      int used = isCaption ? captionRow : isRow ? row : pitch;
      String label = isCaption ? Look.px(Tokens.CAPTION_HEIGHT_MM) + " caption + " + row + " row = " + captionRow
          : isRow ? String.valueOf(row) : "ours " + pitch + ", no native value";
      band(g, x, top, used, scale, label, isRow);
      top += used;
      rule(g, x, top, scale, rule.solid);
    }
    int tail = Math.max(0, height - (rules.isEmpty() ? oursBar : rules.get(rules.size() - 1).y));
    band(g, x, top, tail, scale, "ours " + tail + ", no native value", false);
    int side = Look.px(Tokens.SIDE_MARGIN_MM);
    g.setColor(OURS_MARK);
    g.setStroke(new BasicStroke(THIN, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, DASH, DOTS, DOT_PHASE));
    int leading = x + Math.round(side * scale);
    int trailing = x + PANEL_WIDTH - Math.round(side * scale);
    int end = HEADER + Math.round((top + tail) * scale);
    g.drawLine(leading, HEADER, leading, end);
    g.drawLine(trailing, HEADER, trailing, end);
    g.setStroke(new BasicStroke(THIN));
    g.setColor(FRAME);
    g.drawRect(x, HEADER, PANEL_WIDTH, end - HEADER);
  }

  private static void band(Graphics2D g, int x, int top, int size, float scale, String label, boolean isRow) {
    int y = HEADER + Math.round(top * scale);
    int h = Math.round(size * scale);
    if (!isRow) {
      g.setColor(HATCH);
      g.fillRect(x, y, PANEL_WIDTH, h);
    }
    g.setColor(INK);
    g.setFont(new Font(FONT, Font.PLAIN, SMALL_TEXT_SIZE));
    g.drawString(label + " px", x + LABEL_INSET + Math.round(Look.px(Tokens.SIDE_MARGIN_MM) * scale), y + Math.min(h, SMALL_TEXT_SIZE * HALF) / HALF + SMALL_TEXT_SIZE / HALF);
  }

  private static void rule(Graphics2D g, int x, int y, float scale, boolean solid) {
    int at = HEADER + Math.round(y * scale);
    g.setColor(INK);
    g.setStroke(solid ? new BasicStroke(SOLID_RULE) : new BasicStroke(THIN, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, SOLID_RULE, LIGHT_DOTS, DOT_PHASE));
    g.drawLine(x, at, x + PANEL_WIDTH, at);
    g.setStroke(new BasicStroke(THIN));
  }

  private static void drawTable(Graphics2D g, List<Look.Finding> findings, BufferedImage ours, int x) {
    int y = HEADER;
    g.setFont(new Font(FONT, Font.BOLD, TEXT_SIZE));
    g.setColor(INK);
    g.drawString("Measured, native then ours", x, HEADER - CAPTION_GAP);
    g.setFont(new Font(FONT, Font.PLAIN, TEXT_SIZE));
    for (Look.Finding finding : findings) {
      g.setColor(!finding.nativeFound() ? FRAME : finding.agrees() ? AGREE : OURS_MARK);
      g.drawString(finding.verdict(), x, y + TEXT_SIZE);
      g.setColor(INK);
      g.drawString(finding.name, x + NAME_X, y + TEXT_SIZE);
      String ourValue = finding.ours < 0 ? "not found" : Math.round(finding.ours) + " " + finding.unit;
      String nativeValue = finding.nativeFound() ? String.valueOf(Math.round(finding.nativeValue)) : "not found";
      g.drawString("native " + nativeValue + "   ours " + ourValue, x + NAME_X, y + TEXT_SIZE + CAPTION_GAP + SMALL_TEXT_SIZE);
      y += ROW_STEP + SMALL_TEXT_SIZE;
    }
    int grey = Look.textGrey(ours, Look.barHeight(ours));
    g.setColor(INK);
    String greyLine = grey == 0 ? "Text grey: none found"
        : String.format("Text grey: ours #%06x, %.1f:1 on paper; native text is black, %.1f:1", grey & RGB_BITS,
            Look.contrastOnPaper(grey), Look.contrastOnPaper(Tokens.INK_COLOUR));
    g.setFont(new Font(FONT, Font.PLAIN, SMALL_TEXT_SIZE));
    g.drawString(greyLine, x, y + TEXT_SIZE);
    g.drawString(NATIVE_RELATED, x, y + TEXT_SIZE + ROW_STEP / HALF);
  }
}
