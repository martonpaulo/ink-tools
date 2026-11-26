package com.bridge.providers;

/**
 * When a Calendar or To-Do change starts a sync (#296): a tablet edit, debounced, so a burst of row
 * changes gives one event; never Account Sync's own write, which the provider reports back as a
 * change too. Pure Java with the clock passed in, so the JVM tests drive it; the module holds one
 * and calls it on its handler thread.
 *
 * <p>The echo guard: a change within {@code debounceMs} after Account Sync's last write is that
 * write's echo and is dropped. A tablet edit made during a pass is dropped with it; the timer pass
 * still finds it, as the observer runs beside the timer, never instead of it.
 */
final class ChangeGate {
  private final long debounceMs;
  private long lastOwnWrite = Long.MIN_VALUE;
  private long lastChange = Long.MIN_VALUE;
  private boolean pending;

  ChangeGate(long debounceMs) {
    if (debounceMs <= 0) {
      throw new IllegalArgumentException("the debounce must be above 0 ms, not " + debounceMs);
    }
    this.debounceMs = debounceMs;
  }

  /** Account Sync wrote a row at {@code now}: the changes it causes are not the tablet's. */
  synchronized void ownWrite(long now) {
    lastOwnWrite = now;
  }

  private boolean echo(long now) {
    return lastOwnWrite != Long.MIN_VALUE && now - lastOwnWrite < debounceMs;
  }

  /**
   * A provider reported a change at {@code now}. Answers when {@link #due} should be asked next, or
   * -1 when the change is an echo of Account Sync's own write and starts nothing.
   */
  synchronized long change(long now) {
    if (echo(now)) {
      return -1;
    }
    pending = true;
    lastChange = now;
    return now + debounceMs;
  }

  /**
   * True once, when a change is pending and no other came for {@code debounceMs}: then the module
   * emits its one event. An own write since the change drops it as an echo.
   */
  synchronized boolean due(long now) {
    if (!pending || now - lastChange < debounceMs) {
      return false;
    }
    pending = false;
    return lastOwnWrite == Long.MIN_VALUE || lastOwnWrite < lastChange;
  }
}
