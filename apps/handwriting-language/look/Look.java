package com.supernotetools.lingo;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;

/**
 * Measures a screen's picture against the native look (#299): the black bar, the rules between
 * rows, the margins, a row's pitch, the switch, the radio ring, the chevron and the text greys. Pure:
 * pixels in, numbers out, so a JVM test runs it over a recorded picture. The native values are
 * `Tokens`, written from ui-kit's tokens.json, which `packages/ui-kit/native-catalog.md` explains;
 * they are in physical pixels of the 299 ppi Manta (11.8 px per mm) at any picture width, since the
 * tokens are in millimetres.
 */
final class Look {
  /** A pixel darker than this is ink. */
  static final int INK_BELOW = 112;
  /** A rule's pixel: a thin dotted line draws lighter than text. */
  static final int RULE_BELOW = 172;
  /** The agreement between a native value and ours, in px: a pixel of rounding each way. */
  static final int TOLERANCE_PX = 2;
  /** A rule spans at least this share of the picture's width. */
  private static final float RULE_SPAN = 0.6f;
  /** A solid rule's ink covers at least this share of its span. */
  private static final float SOLID_SHARE = 0.97f;
  /** A dotted rule's ink covers between these shares of its span, in every tenth of it. */
  private static final float DOT_MIN = 0.16f;
  private static final float DOT_MAX = 0.8f;
  private static final int DOT_BINS = 10;
  /** The ink share above or below a rule at most: text rows are no rule. */
  private static final float BLANK_SHARE = 0.03f;
  /** A row's pitch counts as a row when within this share of the native pitch. */
  private static final float ROW_BAND = 0.3f;
  /** A caption box and its row: within this share of their sum. */
  private static final float CAPTION_ROW_BAND = 0.045f;
  /** The switch is about twice as wide as tall; the radio ring is square. */
  private static final float SWITCH_RATIO_MIN = 1.8f;
  private static final float SWITCH_RATIO_MAX = 2.2f;
  private static final int MARK_MIN_PX = 20;
  private static final int MARK_MAX_PX = 155;
  /**
   * A two-pane screen's divider: a column of ink from the bar down at least this share of the
   * picture, between these shares of its width (Settings keeps its menu at the leading side, its
   * divider at 552 of 1920 px on the Manta, measured 2026-11-26, #299).
   */
  private static final float DIVIDER_SHARE = 0.9f;
  private static final float DIVIDER_FROM = 0.2f;
  private static final float DIVIDER_TO = 0.5f;
  /** The controls sit in the trailing part of the picture. */
  private static final float CONTROLS_FROM = 0.6f;
  /** The column read for the black bar, in from the trailing edge, clear of its title and its ×. */
  private static final int BAR_COLUMN_FROM_EDGE = 4;
  private static final int RGB_MASK = 0xff;
  private static final int RED_SHIFT = 16;
  private static final int GREEN_SHIFT = 8;
  /** The relative luminance weights and contrast terms of WCAG 2. */
  private static final double LIN_THRESHOLD = 0.03928;
  private static final double LIN_DIVISOR = 12.92;
  private static final double LIN_OFFSET = 0.055;
  private static final double LIN_SCALE = 1.055;
  private static final double LIN_POWER = 2.4;
  private static final double WEIGHT_RED = 0.2126;
  private static final double WEIGHT_GREEN = 0.7152;
  private static final double WEIGHT_BLUE = 0.0722;
  private static final double CONTRAST_OFFSET = 1.0 / 20.0;
  private static final double CHANNEL_MAX = (double) RGB_MASK;
  /** The grey of the text: the most common pixel value between these, the antialiasing's edges left out. */
  private static final int GREY_LOW = 40;
  private static final int GREY_HIGH = 190;
  /** A grey needs this many pixels to count. */
  private static final int GREY_MIN_PIXELS = 280;
  private static final int LEVELS = RGB_MASK + 1;

  private Look() {}

  /** A horizontal line across the page: a solid one after a group, a dotted one between two rows. */
  static final class Rule {
    final int y;
    final int thickness;
    final boolean solid;
    final int left;
    final int right;

    Rule(int y, int thickness, boolean solid, int left, int right) {
      this.y = y;
      this.thickness = thickness;
      this.solid = solid;
      this.left = left;
      this.right = right;
    }
  }

  /** A drawn mark: the bounding box of one connected piece of ink. */
  static final class Mark {
    final int x;
    final int y;
    final int width;
    final int height;

    Mark(int x, int y, int width, int height) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }

  /** One thing measured: the native value, ours, and whether they agree; a value of -1 is not found. */
  static final class Finding {
    final String name;
    final String unit;
    final double nativeValue;
    final double ours;
    final String note;

    Finding(String name, String unit, double nativeValue, double ours, String note) {
      this.name = name;
      this.unit = unit;
      this.nativeValue = nativeValue;
      this.ours = ours;
      this.note = note;
    }

    /** False when the native screen has none of it, such as a switch on a screen of radio rows. */
    boolean nativeFound() {
      return nativeValue >= 0;
    }

    boolean agrees() {
      return nativeFound() && ours >= 0 && Math.abs(ours - nativeValue) <= TOLERANCE_PX;
    }

    /** «same», «differs», or «no native» when the native screen has none to compare. */
    String verdict() {
      return !nativeFound() ? "no native" : agrees() ? "same" : "differs";
    }
  }

  /** Native millimetres as pixels. */
  static int px(float mm) {
    return Math.round(mm * Tokens.PX_PER_MM);
  }

  static int luminance(int argb) {
    int red = (argb >> RED_SHIFT) & RGB_MASK;
    int green = (argb >> GREEN_SHIFT) & RGB_MASK;
    int blue = argb & RGB_MASK;
    return Math.round(red * (float) WEIGHT_RED + green * (float) WEIGHT_GREEN + blue * (float) WEIGHT_BLUE);
  }

  /** WCAG 2 contrast of a colour on white paper. */
  static double contrastOnPaper(int argb) {
    double luminance = relative(argb);
    return (1.0 + CONTRAST_OFFSET) / (luminance + CONTRAST_OFFSET);
  }

  private static double relative(int argb) {
    double red = channel((argb >> RED_SHIFT) & RGB_MASK);
    double green = channel((argb >> GREEN_SHIFT) & RGB_MASK);
    double blue = channel(argb & RGB_MASK);
    return WEIGHT_RED * red + WEIGHT_GREEN * green + WEIGHT_BLUE * blue;
  }

  private static double channel(int value) {
    double share = value / CHANNEL_MAX;
    return share <= LIN_THRESHOLD ? share / LIN_DIVISOR : Math.pow((share + LIN_OFFSET) / LIN_SCALE, LIN_POWER);
  }

  /** The height of the black bar at the top, read down a column at its trailing edge; 0 with none. */
  static int barHeight(BufferedImage picture) {
    int x = picture.getWidth() - BAR_COLUMN_FROM_EDGE;
    int y = 0;
    while (y < picture.getHeight() && luminance(picture.getRGB(x, y)) < INK_BELOW) {
      y++;
    }
    return y;
  }

  /** The rules below `top`, top to bottom. */
  static List<Rule> rules(BufferedImage picture, int top) {
    int width = picture.getWidth();
    List<Rule> found = new ArrayList<>();
    Rule open = null;
    for (int y = top; y < picture.getHeight(); y++) {
      int[] row = span(picture, y);
      boolean spans = row[2] >= 0 && row[1] - row[0] + 1 >= (int) (RULE_SPAN * width);
      Boolean solid = spans ? kind(picture, row, y) : null;
      if (solid != null && open != null && open.solid == solid.booleanValue() && open.y + open.thickness == y) {
        open = new Rule(open.y, open.thickness + 1, open.solid, Math.min(open.left, row[0]), Math.max(open.right, row[1]));
        found.set(found.size() - 1, open);
      } else if (solid != null && isBlankAround(picture, row, y)) {
        open = new Rule(y, 1, solid.booleanValue(), row[0], row[1]);
        found.add(open);
      } else {
        open = null;
      }
    }
    return found;
  }

  /** {first ink x, last ink x, ink count} of a row, with a count of -1 when it has none. */
  private static int[] span(BufferedImage picture, int y) {
    int first = -1;
    int last = -1;
    int count = 0;
    for (int x = 0; x < picture.getWidth(); x++) {
      if (luminance(picture.getRGB(x, y)) < RULE_BELOW) {
        first = first < 0 ? x : first;
        last = x;
        count++;
      }
    }
    return new int[] {first, last, first < 0 ? -1 : count};
  }

  /** TRUE for a solid row, FALSE for a dotted one, null for neither (text). */
  private static Boolean kind(BufferedImage picture, int[] row, int y) {
    int length = row[1] - row[0] + 1;
    float share = row[2] / (float) length;
    if (share >= SOLID_SHARE) {
      return Boolean.TRUE;
    }
    if (share < DOT_MIN || share > DOT_MAX) {
      return null;
    }
    for (int bin = 0; bin < DOT_BINS; bin++) {
      int from = row[0] + length * bin / DOT_BINS;
      int to = row[0] + length * (bin + 1) / DOT_BINS;
      boolean inked = false;
      for (int x = from; x < to && !inked; x++) {
        inked = luminance(picture.getRGB(x, y)) < RULE_BELOW;
      }
      if (!inked) {
        return null;
      }
    }
    return Boolean.FALSE;
  }

  /** A rule's neighbours, above and below, hold almost no ink there, which text rows always do. */
  private static boolean isBlankAround(BufferedImage picture, int[] row, int y) {
    int length = row[1] - row[0] + 1;
    for (int neighbour : new int[] {y - 1, y + 1}) {
      if (neighbour < 0 || neighbour >= picture.getHeight()) {
        continue;
      }
      int ink = 0;
      for (int x = row[0]; x <= row[1]; x++) {
        ink += luminance(picture.getRGB(x, neighbour)) < RULE_BELOW ? 1 : 0;
      }
      if (ink > BLANK_SHARE * length && ink < SOLID_SHARE * length) {
        return false;
      }
    }
    return true;
  }

  /** Every connected piece of ink in the trailing part of the picture, from `top`, as boxes. */
  static List<Mark> marks(BufferedImage picture, int top) {
    int width = picture.getWidth();
    int from = (int) (CONTROLS_FROM * width);
    boolean[][] seen = new boolean[picture.getHeight()][width];
    List<Mark> found = new ArrayList<>();
    for (int y = top; y < picture.getHeight(); y++) {
      for (int x = from; x < width; x++) {
        if (!seen[y][x] && luminance(picture.getRGB(x, y)) < INK_BELOW) {
          found.add(flood(picture, seen, x, y, from));
        }
      }
    }
    return found;
  }

  private static Mark flood(BufferedImage picture, boolean[][] seen, int startX, int startY, int from) {
    int minX = startX;
    int maxX = startX;
    int minY = startY;
    int maxY = startY;
    java.util.ArrayDeque<int[]> queue = new java.util.ArrayDeque<>();
    queue.add(new int[] {startX, startY});
    seen[startY][startX] = true;
    while (!queue.isEmpty()) {
      int[] at = queue.poll();
      minX = Math.min(minX, at[0]);
      maxX = Math.max(maxX, at[0]);
      minY = Math.min(minY, at[1]);
      maxY = Math.max(maxY, at[1]);
      for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
          int x = at[0] + dx;
          int y = at[1] + dy;
          if (x >= from && x < picture.getWidth() && y >= 0 && y < picture.getHeight() && !seen[y][x]
              && luminance(picture.getRGB(x, y)) < INK_BELOW) {
            seen[y][x] = true;
            queue.add(new int[] {x, y});
          }
        }
      }
    }
    return new Mark(minX, minY, maxX - minX + 1, maxY - minY + 1);
  }

  /** The first mark shaped like the switch's pill, or null. */
  static Mark switchPill(List<Mark> marks) {
    for (Mark mark : marks) {
      float ratio = mark.width / (float) mark.height;
      if (ratio >= SWITCH_RATIO_MIN && ratio <= SWITCH_RATIO_MAX && mark.height >= px(Tokens.SWITCH_HEIGHT_MM) / 2) {
        return mark;
      }
    }
    return null;
  }

  /** The first square mark of the radio ring's size, or null. */
  static Mark radioRing(List<Mark> marks) {
    int size = px(Tokens.RADIO_SIZE_MM);
    for (Mark mark : marks) {
      if (Math.abs(mark.width - mark.height) <= TOLERANCE_PX && mark.width >= size / 2 && mark.width <= size * 2
          && mark.width >= MARK_MIN_PX && mark.width <= MARK_MAX_PX) {
        return mark;
      }
    }
    return null;
  }

  /** The most common grey between the ink and the paper, as an opaque ARGB colour; 0 with none. */
  static int textGrey(BufferedImage picture, int top) {
    int[] counts = new int[LEVELS];
    for (int y = top; y < picture.getHeight(); y++) {
      for (int x = 0; x < picture.getWidth(); x++) {
        int argb = picture.getRGB(x, y);
        int level = argb & RGB_MASK;
        boolean grey = ((argb >> RED_SHIFT) & RGB_MASK) == level && ((argb >> GREEN_SHIFT) & RGB_MASK) == level;
        if (grey && level >= GREY_LOW && level <= GREY_HIGH) {
          counts[level]++;
        }
      }
    }
    int best = -1;
    for (int level = GREY_LOW; level <= GREY_HIGH; level++) {
      if (counts[level] >= GREY_MIN_PIXELS && (best < 0 || counts[level] > counts[best])) {
        best = level;
      }
    }
    return best < 0 ? 0 : Tokens.INK_COLOUR | (best << RED_SHIFT) | (best << GREEN_SHIFT) | best;
  }

  /** Whether a gap between two rules is a row, which has the native pitch within a band. */
  static boolean isRowPitch(int pitch) {
    int row = px(Tokens.ROW_HEIGHT_MM);
    return Math.abs(pitch - row) <= ROW_BAND * row;
  }

  /** Whether a gap between two rules is a section caption's box and the row under it. */
  static boolean isCaptionRowPitch(int pitch) {
    int both = px(Tokens.CAPTION_HEIGHT_MM) + px(Tokens.ROW_HEIGHT_MM);
    return Math.abs(pitch - both) <= CAPTION_ROW_BAND * both;
  }

  /** Every difference worth a line, native value then ours; a value of -1 is not found. */
  /**
   * The content pane of a two-pane screen, right of its divider; the picture itself when it has one
   * pane. Settings' native screens keep a menu at the leading side, so their rows span the pane, not
   * the picture, and the margins count from the divider.
   */
  static BufferedImage contentPane(BufferedImage picture) {
    int bar = barHeight(picture);
    int width = picture.getWidth();
    int height = picture.getHeight();
    int needed = Math.round((height - bar) * DIVIDER_SHARE);
    int x = Math.round(width * DIVIDER_FROM);
    while (x < Math.round(width * DIVIDER_TO) && columnInk(picture, x, bar) < needed) {
      x++;
    }
    if (x >= Math.round(width * DIVIDER_TO)) {
      return picture;
    }
    // The divider is 2 px wide on the Manta: the pane starts after its last column.
    while (x + 1 < width && columnInk(picture, x + 1, bar) >= needed) {
      x++;
    }
    return picture.getSubimage(x + 1, 0, width - x - 1, height);
  }

  private static int columnInk(BufferedImage picture, int x, int top) {
    int ink = 0;
    for (int y = top; y < picture.getHeight(); y++) {
      ink += luminance(picture.getRGB(x, y)) < RULE_BELOW ? 1 : 0;
    }
    return ink;
  }

  static List<Finding> measure(BufferedImage whole) {
    BufferedImage picture = contentPane(whole);
    List<Finding> findings = new ArrayList<>();
    int bar = barHeight(picture);
    findings.add(new Finding("Title bar height", "px", px(Tokens.TITLE_BAR_HEIGHT_MM), bar > 0 ? bar : -1, ""));
    List<Rule> rules = rules(picture, bar);
    Rule solid = null;
    int pitchMin = Integer.MAX_VALUE;
    int pitchMax = -1;
    int rows = 0;
    int captionPitch = -1;
    int worst = -1;
    for (int i = 0; i < rules.size(); i++) {
      solid = solid == null && rules.get(i).solid ? rules.get(i) : solid;
      int pitch = i == 0 ? rules.get(i).y - bar : rules.get(i).y - rules.get(i - 1).y;
      if (isCaptionRowPitch(pitch)) {
        int far = Math.abs(pitch - (px(Tokens.CAPTION_HEIGHT_MM) + px(Tokens.ROW_HEIGHT_MM)));
        if (far > worst) {
          worst = far;
          captionPitch = pitch;
        }
      } else if (isRowPitch(pitch)) {
        pitchMin = Math.min(pitchMin, pitch);
        pitchMax = Math.max(pitchMax, pitch);
        rows++;
      }
    }
    String rowNote = rows == 0 ? "no row found" : rows + " rows, " + pitchMin + " to " + pitchMax + " px";
    findings.add(new Finding("Row height, rule to rule", "px", px(Tokens.ROW_HEIGHT_MM), rows == 0 ? -1 : pitchMax, rowNote));
    findings.add(new Finding("Caption box and its row", "px", px(Tokens.CAPTION_HEIGHT_MM) + px(Tokens.ROW_HEIGHT_MM), captionPitch,
        captionPitch < 0 ? "no caption found" : "rule to rule, the line included"));
    findings.add(new Finding("Solid rule thickness", "px", px(Tokens.SEPARATOR_MM), solid == null ? -1 : solid.thickness, ""));
    Rule dotted = null;
    for (Rule rule : rules) {
      dotted = dotted == null && !rule.solid ? rule : dotted;
    }
    findings.add(new Finding("Dotted rule thickness", "px", px(Tokens.LIGHT_LINE_MM), dotted == null ? -1 : dotted.thickness, ""));
    int side = px(Tokens.SIDE_MARGIN_MM);
    findings.add(new Finding("Leading margin", "px", side, solid == null ? -1 : solid.left, ""));
    findings.add(new Finding("Trailing margin", "px", side, solid == null ? -1 : picture.getWidth() - 1 - solid.right, ""));
    List<Mark> marks = marks(picture, bar);
    Mark pill = switchPill(marks);
    findings.add(new Finding("Switch track width", "px", px(Tokens.SWITCH_WIDTH_MM), pill == null ? -1 : pill.width, ""));
    findings.add(new Finding("Switch track height", "px", px(Tokens.SWITCH_HEIGHT_MM), pill == null ? -1 : pill.height, ""));
    Mark ring = radioRing(marks);
    findings.add(new Finding("Radio ring", "px", px(Tokens.RADIO_SIZE_MM), ring == null ? -1 : ring.width, ""));
    return findings;
  }
}
