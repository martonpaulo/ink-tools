package com.supernotetools.dialect;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;

/**
 * The e-ink look, in one place: black on white, a black outline, no animation, large targets
 * (docs/supernote.md › Display; #157).
 */
final class Ink {
  private Ink() {}

  static final int INK = Color.BLACK;
  static final int PAPER = Color.WHITE;
  /** The smallest touch target, about 10 mm on the tablet's 300 dpi screen. */
  static final int TARGET_DP = 64;
  static final int OUTLINE_DP = 2;
  static final int GAP_DP = 16;
  static final float TEXT_SP = 22;
  static final float TITLE_SP = 32;
  static final float BUTTON_SP = 26;

  static int px(Context context, float dp) {
    return Math.round(TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, dp, context.getResources().getDisplayMetrics()));
  }

  /** A white box with a black outline; `filled` draws it black, for a chosen check box. */
  static GradientDrawable box(Context context, boolean filled, int sizeDp) {
    GradientDrawable box = new GradientDrawable();
    box.setColor(filled ? INK : PAPER);
    box.setStroke(px(context, OUTLINE_DP), INK);
    if (sizeDp > 0) {
      box.setSize(px(context, sizeDp), px(context, sizeDp));
    }
    return box;
  }
}
