package com.supernotetools.lingo;

/**
 * One touch on the floating button, from its motion events (#244): a tap switches the language, a
 * long press opens the settings screen, a drag moves the button. A move past the touch slop before
 * the long-press time starts a drag; after a long press, moves do nothing. No Android import, so a
 * JVM test covers it; OverlayService passes the system's slop and long-press time.
 */
final class ButtonGesture {
  /** What a finished touch did. */
  enum Result {
    TAP,
    LONG_PRESS,
    DRAG,
    /** Nothing more to do: the long press already ran when it was due, or no touch began. */
    NONE
  }

  private final int slop;
  private final long longPressMs;
  private boolean down;
  private float downX;
  private float downY;
  private long downMs;
  private boolean dragging;
  private boolean longPressed;

  ButtonGesture(int slop, long longPressMs) {
    this.slop = slop;
    this.longPressMs = longPressMs;
  }

  /** The pen or finger touches the button; `x` and `y` are screen pixels. */
  void down(float x, float y, long ms) {
    down = true;
    downX = x;
    downY = y;
    downMs = ms;
    dragging = false;
    longPressed = false;
  }

  /** Whether the touch is now a drag, so the button follows it. */
  boolean move(float x, float y, long ms) {
    if (!down || longPressed) {
      return false;
    }
    if (!dragging && ms - downMs < longPressMs && Math.hypot(x - downX, y - downY) > slop) {
      dragging = true;
    }
    return dragging;
  }

  /** True once, when the touch has been held still for the long-press time. */
  boolean longPressDue(long ms) {
    if (!down || dragging || longPressed || ms - downMs < longPressMs) {
      return false;
    }
    longPressed = true;
    return true;
  }

  /** The touch ends: what it did. A long press found due only now still counts as one. */
  Result up(long ms) {
    if (!down) {
      return Result.NONE;
    }
    down = false;
    if (dragging) {
      return Result.DRAG;
    }
    if (longPressed) {
      return Result.NONE;
    }
    return ms - downMs >= longPressMs ? Result.LONG_PRESS : Result.TAP;
  }

  /** The system cancelled the touch: it did nothing. */
  void cancel() {
    down = false;
  }

  /** The offset of the touch from where it began, for the button to follow. */
  float dx(float x) {
    return x - downX;
  }

  float dy(float y) {
    return y - downY;
  }
}
