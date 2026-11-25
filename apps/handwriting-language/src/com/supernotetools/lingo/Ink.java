package com.supernotetools.lingo;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The Supernote's native controls, drawn as `@ink-tools/ui-kit` draws them for the plugins
 * (#273, #275): the title bar, the list row, the switch, the radio button, the section caption
 * and the bordered button. Every size, colour and control word comes from `Tokens`, which
 * scripts/build.cjs writes from packages/ui-kit/src/tokens.json, so this class holds no value of
 * its own. Black on white, no animation (docs/supernote.md › Display).
 */
final class Ink {
  private Ink() {}

  static final int INK = Tokens.INK_COLOUR;
  static final int PAPER = Tokens.PAPER_COLOUR;
  static final int CONTEXT = Tokens.CONTEXT_COLOUR;
  private static final String SWITCH_ROLE = "android.widget.Switch";
  private static final String RADIO_ROLE = "android.widget.RadioButton";
  private static final String BUTTON_ROLE = "android.widget.Button";
  private static final String CLOSE_GLYPH = "×";

  /**
   * Millimetres in pixels, rounded to whole layout units first, as metrics.ts does, so a control
   * here and its ui-kit twin are the same size on the same tablet.
   */
  static int px(Context context, float mm) {
    float density = context.getResources().getDisplayMetrics().density;
    return Math.round(Math.round(mm * Tokens.PX_PER_MM / density) * density);
  }

  /** A font size in millimetres as sp, the unit metrics.ts gives React Native, so it scales with the system text. */
  static float sp(Context context, float mm) {
    return Math.round(mm * Tokens.PX_PER_MM / context.getResources().getDisplayMetrics().density);
  }

  static int border(Context context) {
    return Math.max(1, px(context, Tokens.BORDER_MM));
  }

  static int space(Context context) {
    return px(context, Tokens.SPACE_MM);
  }

  static float bodySp(Context context) {
    return sp(context, Tokens.BODY_FONT_MM);
  }

  static float largeSp(Context context) {
    return bodySp(context) * Tokens.LARGE_FONT_RATIO;
  }

  static int target(Context context) {
    return px(context, Tokens.TOUCH_TARGET_MM);
  }

  /** Body text in ink, or in the context grey for a hint or a value. */
  static TextView text(Context context, String value, boolean grey) {
    TextView view = new TextView(context);
    view.setText(value);
    view.setTextColor(grey ? CONTEXT : INK);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, bodySp(context));
    return view;
  }

  /** The black band: × to close at the leading edge, the title centred (ui-kit `TitleBar`). */
  static LinearLayout titleBar(Context context, String title, String closeName, Runnable onClose) {
    LinearLayout band = new LinearLayout(context);
    band.setOrientation(LinearLayout.HORIZONTAL);
    band.setGravity(Gravity.CENTER_VERTICAL);
    band.setBackgroundColor(INK);
    band.setMinimumHeight(px(context, Tokens.TITLE_BAR_HEIGHT_MM));
    int space = space(context);
    band.setPadding(space, 0, space, 0);
    TextView close = new TextView(context);
    close.setText(CLOSE_GLYPH);
    close.setTextColor(PAPER);
    close.setTextSize(TypedValue.COMPLEX_UNIT_SP, largeSp(context));
    close.setGravity(Gravity.CENTER);
    close.setMinWidth(target(context));
    close.setMinHeight(target(context));
    close.setContentDescription(closeName);
    role(close, BUTTON_ROLE, null);
    close.setOnClickListener(view -> onClose.run());
    band.addView(close, new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    TextView name = new TextView(context);
    name.setText(title);
    name.setTextColor(PAPER);
    name.setTextSize(TypedValue.COMPLEX_UNIT_SP, bodySp(context));
    name.setTypeface(Typeface.DEFAULT_BOLD);
    name.setGravity(Gravity.CENTER);
    name.setSingleLine(true);
    name.setAccessibilityHeading(true);
    LinearLayout.LayoutParams fill = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    fill.setMarginStart(space);
    band.addView(name, fill);
    return band;
  }

  /**
   * A list row (ui-kit `ListRow`): the title, an optional grey subtitle, a solid ink separator
   * under it and a trailing control. The whole row is one target; the trailing control only shows.
   */
  static LinearLayout row(Context context, String title, String subtitle, View trailing) {
    LinearLayout row = new LinearLayout(context);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.CENTER_VERTICAL);
    row.setMinimumHeight(target(context));
    int space = space(context);
    row.setPadding(0, space, 0, space);
    row.setBackground(separator(context));
    LinearLayout texts = new LinearLayout(context);
    texts.setOrientation(LinearLayout.VERTICAL);
    texts.addView(text(context, title, false));
    if (subtitle != null) {
      texts.addView(text(context, subtitle, true));
    }
    row.addView(texts, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
    if (trailing != null) {
      trailing.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
      LinearLayout.LayoutParams end = new LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
      end.setMarginStart(space);
      row.addView(trailing, end);
    }
    row.setClickable(true);
    row.setFocusable(true);
    return row;
  }

  /** A row whose trailing control is the switch; it speaks as a switch with its state. */
  static LinearLayout switchRow(Context context, String title, String subtitle, boolean on) {
    LinearLayout row = row(context, title, subtitle, switchBox(context, on));
    role(row, SWITCH_ROLE, on);
    return row;
  }

  /** A row whose trailing control is the radio button; it speaks as a radio button with its state. */
  static LinearLayout radioRow(Context context, String title, boolean checked) {
    LinearLayout row = row(context, title, null, radio(context, checked));
    role(row, RADIO_ROLE, checked);
    return row;
  }

  /** The switch (ui-kit `Switch`): a bordered box that reads «ON», filled black, or «OFF», on paper. */
  static TextView switchBox(Context context, boolean on) {
    TextView box = text(context, on ? Tokens.ON_TEXT : Tokens.OFF_TEXT, false);
    box.setTextColor(on ? PAPER : INK);
    box.setGravity(Gravity.CENTER);
    box.setMinWidth(px(context, Tokens.SWITCH_WIDTH_MM));
    box.setMinHeight(target(context));
    box.setBackground(outline(context, on ? INK : PAPER, INK, false));
    return box;
  }

  /** The radio button (ui-kit `Radio`): an ink ring, with a filled dot when chosen, in a touch target. */
  static View radio(Context context, boolean checked) {
    GradientDrawable ring = new GradientDrawable();
    ring.setShape(GradientDrawable.OVAL);
    ring.setColor(PAPER);
    ring.setStroke(border(context), INK);
    int size = px(context, Tokens.RADIO_SIZE_MM);
    ring.setSize(size, size);
    Drawable mark = ring;
    if (checked) {
      GradientDrawable dot = new GradientDrawable();
      dot.setShape(GradientDrawable.OVAL);
      dot.setColor(INK);
      LayerDrawable both = new LayerDrawable(new Drawable[] {ring, dot});
      int inset = (size - px(context, Tokens.RADIO_DOT_MM)) / 2;
      both.setLayerInset(1, inset, inset, inset, inset);
      mark = both;
    }
    TextView target = new TextView(context);
    target.setGravity(Gravity.CENTER);
    target.setMinWidth(target(context));
    target.setMinHeight(target(context));
    target.setCompoundDrawablesRelativeWithIntrinsicBounds(mark, null, null, null);
    return target;
  }

  /** A grey caption over the rows it names, such as «Languages in the cycle» (ui-kit `SectionCaption`). */
  static TextView caption(Context context, String value) {
    TextView view = text(context, value, true);
    view.setPadding(0, space(context), 0, 0);
    view.setAccessibilityHeading(true);
    return view;
  }

  /**
   * The bordered button (ui-kit `Button`): black fill for the one primary action of the screen; a
   * disabled one is a dashed grey outline with a grey label, so it reads apart at a glance (#233).
   */
  static Button button(Context context, String label, boolean primary, boolean enabled) {
    Button view = new Button(context);
    view.setText(label);
    view.setAllCaps(false);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, bodySp(context));
    view.setStateListAnimator(null);
    view.setMinHeight(px(context, Tokens.CONTROL_HEIGHT_MM));
    view.setMinimumHeight(px(context, Tokens.CONTROL_HEIGHT_MM));
    view.setMinWidth(target(context));
    view.setMinimumWidth(target(context));
    int space = space(context);
    view.setPadding(space, 0, space, 0);
    view.setEnabled(enabled);
    boolean filled = primary && enabled;
    view.setTextColor(!enabled ? CONTEXT : filled ? PAPER : INK);
    view.setBackground(outline(context, filled ? INK : PAPER, enabled ? INK : CONTEXT, !enabled));
    return view;
  }

  /** A box with the ink border; dashed for a control that cannot act. */
  static GradientDrawable outline(Context context, int fill, int stroke, boolean dashed) {
    GradientDrawable box = new GradientDrawable();
    box.setColor(fill);
    int width = border(context);
    if (dashed) {
      box.setStroke(width, stroke, width * 3f, width * 2f);
    } else {
      box.setStroke(width, stroke);
    }
    return box;
  }

  /** Paper with one solid ink line at the bottom: a list row's separator. */
  private static LayerDrawable separator(Context context) {
    GradientDrawable line = new GradientDrawable();
    line.setColor(INK);
    GradientDrawable paper = new GradientDrawable();
    paper.setColor(PAPER);
    LayerDrawable layers = new LayerDrawable(new Drawable[] {line, paper});
    layers.setLayerInset(1, 0, 0, 0, border(context));
    return layers;
  }

  /** The role a screen reader speaks, and the checked state for a switch or a radio button. */
  private static void role(View view, String className, Boolean checked) {
    view.setAccessibilityDelegate(new View.AccessibilityDelegate() {
      @Override
      public void onInitializeAccessibilityNodeInfo(View host, AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(host, info);
        info.setClassName(className);
        if (checked != null) {
          info.setCheckable(true);
          info.setChecked(checked);
        }
      }
    });
  }
}
