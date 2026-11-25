package com.supernotetools.lingo;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.List;

/**
 * The Supernote's native controls, drawn as `@ink-tools/ui-kit` draws them for the plugins
 * (#273, #275, #272): the title bar, the list row, the group of rows under its caption, the switch,
 * the radio button, the bordered button and the small filled button, and the text style of each
 * native role. Every size, colour, text style and control word comes from `Tokens`, which
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

  static int target(Context context) {
    return px(context, Tokens.TOUCH_TARGET_MM);
  }

  /** The native text roles (tokens.json `text`, #272): each its size and colour, all regular weight. */
  enum Role {
    BAR_TITLE(Tokens.BAR_TITLE_STYLE_FONT_MM, Tokens.BAR_TITLE_STYLE_COLOUR),
    CAPTION(Tokens.CAPTION_STYLE_FONT_MM, Tokens.CAPTION_STYLE_COLOUR),
    ROW_TITLE(Tokens.ROW_TITLE_STYLE_FONT_MM, Tokens.ROW_TITLE_STYLE_COLOUR),
    SUBTITLE(Tokens.SUBTITLE_STYLE_FONT_MM, Tokens.SUBTITLE_STYLE_COLOUR),
    HINT(Tokens.HINT_STYLE_FONT_MM, Tokens.HINT_STYLE_COLOUR);

    final float fontMm;
    final int colour;

    Role(float fontMm, int colour) {
      this.fontMm = fontMm;
      this.colour = colour;
    }
  }

  /** Text in the style of its native role. */
  static TextView text(Context context, String value, Role role) {
    TextView view = new TextView(context);
    view.setText(value);
    view.setTextColor(role.colour);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(context, role.fontMm));
    return view;
  }

  /**
   * The black band (ui-kit `TitleBar`): the drawn × at the leading edge, its centre where the native
   * one sits (#272), and the title centred on the band's full width, as the native title bar centres
   * it in its parent, so the × never pushes it; the title in the native size and regular weight
   * (owner, #275).
   */
  static FrameLayout titleBar(Context context, String title, String closeName, Runnable onClose) {
    FrameLayout band = new FrameLayout(context);
    band.setBackgroundColor(INK);
    band.setMinimumHeight(px(context, Tokens.TITLE_BAR_HEIGHT_MM));
    int target = target(context);
    View close = new View(context);
    close.setBackground(new CloseMark(px(context, Tokens.CLOSE_MARK_MM), px(context, Tokens.MARK_STROKE_MM)));
    close.setContentDescription(closeName);
    role(close, BUTTON_ROLE, null);
    close.setOnClickListener(view -> onClose.run());
    FrameLayout.LayoutParams start = new FrameLayout.LayoutParams(target, target, Gravity.START | Gravity.CENTER_VERTICAL);
    int inset = Math.max(0, px(context, Tokens.CLOSE_CENTRE_MM) - target / 2);
    start.setMarginStart(inset);
    band.addView(close, start);
    TextView name = text(context, title, Role.BAR_TITLE);
    name.setGravity(Gravity.CENTER);
    // Two lines at most, never cut short (interface rule 9). Over the × and after it, as ui-kit
    // reads them; not clickable, so a tap reaches the × under it.
    name.setMaxLines(2);
    name.setClickable(false);
    name.setAccessibilityHeading(true);
    // Inset by the same width on both sides: centred on the band, never under the ×.
    int edge = inset + target;
    name.setPadding(edge, 0, edge, 0);
    band.addView(name, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER));
    return band;
  }

  /** A drawn mark: one paint, no alpha or colour filter of its own. */
  abstract static class Mark extends Drawable {
    final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    Mark(int stroke) {
      paint.setStrokeWidth(stroke);
      paint.setStrokeCap(Paint.Cap.SQUARE);
    }

    @Override
    public void setAlpha(int alpha) {
      paint.setAlpha(alpha);
    }

    @Override
    public void setColorFilter(ColorFilter filter) {
      paint.setColorFilter(filter);
    }

    @Override
    public int getOpacity() {
      return PixelFormat.TRANSLUCENT;
    }
  }

  /** The native ×: two paper strokes crossing in a square of the native size, centred in its view. */
  static final class CloseMark extends Mark {
    private final int size;

    CloseMark(int size, int stroke) {
      super(stroke);
      this.size = size;
      paint.setColor(PAPER);
      paint.setStrokeCap(Paint.Cap.BUTT);
    }

    @Override
    public void draw(Canvas canvas) {
      float half = size / 2f;
      float x = getBounds().exactCenterX();
      float y = getBounds().exactCenterY();
      canvas.drawLine(x - half, y - half, x + half, y + half, paint);
      canvas.drawLine(x - half, y + half, x + half, y - half, paint);
    }
  }

  /**
   * A list row (ui-kit `ListRow`): the title and a trailing control, with no line of its own
   * (`group` draws the lines). The whole row is one target; the trailing control only shows.
   */
  static LinearLayout row(Context context, String title, View trailing) {
    return row(context, title, null, trailing);
  }

  /** The same with a subtitle under the title, such as a choice's detail. */
  static LinearLayout row(Context context, String title, String subtitle, View trailing) {
    LinearLayout row = plainRow(context, title, subtitle, trailing);
    trailing.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    row.setClickable(true);
    row.setFocusable(true);
    return row;
  }

  /**
   * A row that does one thing when pressed, such as «Switch to Next Language» or «Reset Button
   * Position»: its title only, as the native Settings offer an action in its group (#272, #275);
   * one that cannot act now is grey and still says why in the group's note.
   */
  static LinearLayout actionRow(Context context, String title, boolean enabled) {
    LinearLayout row = plainRow(context, title, null, null);
    ((TextView) row.getChildAt(0)).setTextColor(enabled ? INK : CONTEXT);
    row.setEnabled(enabled);
    row.setClickable(enabled);
    row.setFocusable(true);
    role(row, BUTTON_ROLE, null);
    return row;
  }

  /** A row that shows a value at its trailing edge, as Settings › Language & Region's «English». */
  static LinearLayout valueRow(Context context, String title, String value) {
    return plainRow(context, title, null, text(context, value, Role.SUBTITLE));
  }

  /** A row that opens another screen: the native › at its trailing edge (#272). */
  static LinearLayout chevronRow(Context context, String title) {
    View chevron = new View(context);
    int height = px(context, Tokens.CHEVRON_HEIGHT_MM);
    chevron.setBackground(new Chevron(px(context, Tokens.MARK_STROKE_MM)));
    chevron.setLayoutParams(new LinearLayout.LayoutParams(height / 2, height));
    LinearLayout row = row(context, title, chevron);
    role(row, BUTTON_ROLE, null);
    return row;
  }

  /**
   * The title, an optional subtitle under it, and an optional trailing control. A language row
   * shows the language's name only, never its code (owner, #275).
   */
  private static LinearLayout plainRow(Context context, String title, String subtitle, View trailing) {
    LinearLayout row = new LinearLayout(context);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.CENTER_VERTICAL);
    // The native row's fixed height (#272); text that grows with the system scale grows it.
    row.setMinimumHeight(px(context, Tokens.ROW_HEIGHT_MM));
    LinearLayout.LayoutParams fill = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    if (subtitle == null) {
      row.addView(text(context, title, Role.ROW_TITLE), fill);
    } else {
      LinearLayout texts = new LinearLayout(context);
      texts.setOrientation(LinearLayout.VERTICAL);
      texts.addView(text(context, title, Role.ROW_TITLE));
      texts.addView(text(context, subtitle, Role.SUBTITLE));
      row.addView(texts, fill);
    }
    if (trailing != null) {
      LinearLayout.LayoutParams end = trailing.getLayoutParams() instanceof LinearLayout.LayoutParams
          ? (LinearLayout.LayoutParams) trailing.getLayoutParams()
          : new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
      end.setMarginStart(px(context, Tokens.MARK_GAP_MM));
      row.addView(trailing, end);
    }
    return row;
  }

  /** A row whose trailing control is the switch; it speaks as a switch with its state. */
  static LinearLayout switchRow(Context context, String title, boolean on) {
    LinearLayout row = row(context, title, switchBox(context, on));
    role(row, SWITCH_ROLE, on);
    return row;
  }

  /** A row whose trailing control is the radio button; it speaks as a radio button with its state. */
  static LinearLayout radioRow(Context context, String title, String subtitle, boolean checked) {
    LinearLayout row = row(context, title, subtitle, radio(context, checked));
    role(row, RADIO_ROLE, checked);
    return row;
  }

  /** A switch row's new state, in place (#281): only its trailing switch is drawn again. */
  static void setSwitch(LinearLayout row, boolean on) {
    replaceTrailing(row, switchBox(row.getContext(), on));
    role(row, SWITCH_ROLE, on);
  }

  /** A radio row's new state, in place (#281). */
  static void setRadio(LinearLayout row, boolean checked) {
    replaceTrailing(row, radio(row.getContext(), checked));
    role(row, RADIO_ROLE, checked);
  }

  /** A value row's new value, in place (#281). */
  static void setValue(LinearLayout row, String value) {
    value(row).setText(value);
  }

  /** A value row's value view, the trailing view `valueRow` adds. */
  static TextView value(LinearLayout row) {
    return (TextView) row.getChildAt(row.getChildCount() - 1);
  }

  /** Swaps a row's trailing control, the last view `plainRow` adds, keeping its place. */
  private static void replaceTrailing(LinearLayout row, View trailing) {
    int last = row.getChildCount() - 1;
    ViewGroup.LayoutParams params = row.getChildAt(last).getLayoutParams();
    row.removeViewAt(last);
    trailing.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    row.addView(trailing, params);
  }

  /**
   * The switch (ui-kit `Switch`, #272): «ON» or «OFF» beside a pill-shaped track; on, the track is
   * filled black with a paper knob at its trailing end; off, an ink outline with an ink knob at its
   * leading end.
   */
  static LinearLayout switchBox(Context context, boolean on) {
    LinearLayout box = new LinearLayout(context);
    box.setOrientation(LinearLayout.HORIZONTAL);
    box.setGravity(Gravity.CENTER_VERTICAL);
    box.setMinimumHeight(target(context));
    box.addView(text(context, on ? Tokens.ON_TEXT : Tokens.OFF_TEXT, Role.SUBTITLE));
    int height = px(context, Tokens.SWITCH_HEIGHT_MM);
    int stroke = px(context, Tokens.MARK_STROKE_MM);
    GradientDrawable pill = new GradientDrawable();
    pill.setCornerRadius(height / 2f);
    pill.setColor(on ? INK : PAPER);
    pill.setStroke(stroke, INK);
    FrameLayout track = new FrameLayout(context);
    track.setBackground(pill);
    GradientDrawable dot = new GradientDrawable();
    dot.setShape(GradientDrawable.OVAL);
    dot.setColor(on ? PAPER : INK);
    View knob = new View(context);
    knob.setBackground(dot);
    int size = px(context, Tokens.SWITCH_KNOB_MM);
    FrameLayout.LayoutParams place = new FrameLayout.LayoutParams(
        size, size, (on ? Gravity.END : Gravity.START) | Gravity.CENTER_VERTICAL);
    // The same gap to the track's outer edge on every side, as the native knob.
    int inset = (height - size) / 2;
    place.setMarginStart(inset);
    place.setMarginEnd(inset);
    track.addView(knob, place);
    LinearLayout.LayoutParams trackSize = new LinearLayout.LayoutParams(px(context, Tokens.SWITCH_WIDTH_MM), height);
    trackSize.setMarginStart(px(context, Tokens.MARK_GAP_MM));
    box.addView(track, trackSize);
    return box;
  }

  /** The radio button (ui-kit `Radio`): an ink ring, with a filled dot when chosen, in a touch target. */
  static View radio(Context context, boolean checked) {
    GradientDrawable ring = new GradientDrawable();
    ring.setShape(GradientDrawable.OVAL);
    ring.setColor(PAPER);
    ring.setStroke(px(context, Tokens.MARK_STROKE_MM), INK);
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
    View ringView = new View(context);
    ringView.setBackground(mark);
    FrameLayout target = new FrameLayout(context);
    target.setMinimumWidth(target(context));
    target.setMinimumHeight(target(context));
    target.addView(ringView, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
    return target;
  }

  /**
   * Rows that belong together, as the native screens group them (owner, #275; ui-kit `RowGroup`,
   * #272): the caption in ink at the bottom of its native box, then its rows with the light dotted
   * line between two of them and the solid line after the last, none under the caption; the note
   * that explains the group sits under the last row, above the solid line (null for none). The
   * caption's box is the space above it; a group with no caption (null) starts right after the one above.
   */
  static LinearLayout group(Context context, String caption, List<? extends View> rows, String note) {
    LinearLayout group = new LinearLayout(context);
    group.setOrientation(LinearLayout.VERTICAL);
    if (caption != null) {
      TextView head = text(context, caption, Role.CAPTION);
      head.setAccessibilityHeading(true);
      head.setGravity(Gravity.BOTTOM);
      head.setMinHeight(px(context, Tokens.CAPTION_HEIGHT_MM));
      group.addView(head);
    }
    for (int index = 0; index < rows.size(); index++) {
      if (index > 0) {
        group.addView(lightLine(context));
      }
      group.addView(rows.get(index), new LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }
    if (note != null) {
      TextView explain = text(context, note, Role.SUBTITLE);
      explain.setPadding(0, 0, 0, space(context));
      group.addView(explain);
    }
    View line = new View(context);
    line.setBackgroundColor(INK);
    group.addView(line, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, devicePx(Tokens.SEPARATOR_MM)));
    return group;
  }

  /**
   * The light dotted line between two rows of one group: 1 px, 3 on, 4 off, as the native one
   * (#272). Drawn as dashes, since a dashed GradientDrawable line did not show on the tablet.
   */
  private static View lightLine(Context context) {
    View line = new View(context);
    line.setBackground(new Dashes(devicePx(Tokens.LIGHT_DASH_MM), devicePx(Tokens.LIGHT_GAP_MM)));
    line.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, devicePx(Tokens.LIGHT_LINE_MM)));
    return line;
  }

  /** Ink dashes across the bounds' full height. */
  static final class Dashes extends Mark {
    private final int dash;
    private final int gap;

    Dashes(int dash, int gap) {
      super(0);
      this.dash = dash;
      this.gap = gap;
      paint.setColor(INK);
      paint.setStyle(Paint.Style.FILL);
    }

    @Override
    public void draw(Canvas canvas) {
      android.graphics.Rect box = getBounds();
      for (int x = box.left; x < box.right; x += dash + gap) {
        canvas.drawRect(x, box.top, Math.min(x + dash, box.right), box.bottom, paint);
      }
    }
  }

  /** The native ›: two ink strokes at a right angle, pointing to the trailing edge. */
  static final class Chevron extends Mark {
    Chevron(int stroke) {
      super(stroke);
      paint.setColor(INK);
    }

    @Override
    public void draw(Canvas canvas) {
      android.graphics.Rect box = getBounds();
      float inset = paint.getStrokeWidth() / 2f;
      canvas.drawLine(box.left + inset, box.top + inset, box.right - inset, box.exactCenterY(), paint);
      canvas.drawLine(box.right - inset, box.exactCenterY(), box.left + inset, box.bottom - inset, paint);
    }
  }

  /** A line's thickness or dash in whole device pixels, at least one, as metrics.ts rounds them. */
  private static int devicePx(float mm) {
    return Math.max(1, Math.round(mm * Tokens.PX_PER_MM));
  }

  /**
   * The bordered button (ui-kit `Button`): black fill for the one primary action of the screen; a
   * disabled one is a dashed grey outline with a grey label, so it reads apart at a glance (#233).
   */
  static Button button(Context context, String label, boolean primary, boolean enabled) {
    Button view = new Button(context);
    view.setText(label);
    view.setAllCaps(false);
    // The ui-kit button's label is regular weight; Material's button text is medium and spaced.
    view.setTypeface(Typeface.DEFAULT);
    view.setLetterSpacing(0);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(context, Role.ROW_TITLE.fontMm));
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
