package com.supernotetools.lingo;

import com.supernotetools.lingo.ButtonGesture.Result;

/** Plain JVM test, no framework: tap, long press and drag apart from the motion events (#244). */
public final class ButtonGestureTest {
  private static final int SLOP = 24;
  private static final long LONG = 500;

  public static void main(String[] args) {
    ButtonGesture gesture = new ButtonGesture(SLOP, LONG);

    gesture.down(100, 100, 0);
    check(gesture.up(120) == Result.TAP, "a short touch is a tap");

    gesture.down(100, 100, 0);
    check(!gesture.move(110, 108, 50), "a wobble within the slop is no drag");
    check(gesture.up(150) == Result.TAP, "a wobble within the slop is still a tap");

    gesture.down(100, 100, 0);
    check(!gesture.longPressDue(499), "no long press before its time");
    check(gesture.longPressDue(500), "a still hold is a long press at its time");
    check(!gesture.longPressDue(800), "the long press runs once");
    check(!gesture.move(400, 400, 900), "a move after a long press is no drag");
    check(gesture.up(1000) == Result.NONE, "after a long press the touch does nothing more");

    gesture.down(100, 100, 0);
    check(gesture.up(600) == Result.LONG_PRESS, "a long hold whose check did not run yet is a long press");

    gesture.down(100, 100, 0);
    check(gesture.move(100, 130, 100), "a move past the slop starts a drag");
    check(gesture.move(105, 131, 700), "a drag goes on past the long-press time");
    check(!gesture.longPressDue(700), "a drag never becomes a long press");
    check(gesture.dx(400) == 300 && gesture.dy(50) == -50, "the offset is from where the touch began");
    check(gesture.up(800) == Result.DRAG, "a drag ends as a drag, never a tap");

    gesture.down(100, 100, 0);
    check(!gesture.move(300, 300, 600), "a first move past the slop after the long-press time is no drag");
    check(gesture.up(700) == Result.LONG_PRESS, "that touch is a long press");

    gesture.down(100, 100, 0);
    gesture.move(200, 200, 50);
    gesture.cancel();
    check(gesture.up(100) == Result.NONE, "a cancelled touch does nothing");
    check(!gesture.move(300, 300, 150), "no drag without a touch");
    check(!gesture.longPressDue(900), "no long press without a touch");
    System.out.println("ButtonGestureTest ok");
  }

  static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
