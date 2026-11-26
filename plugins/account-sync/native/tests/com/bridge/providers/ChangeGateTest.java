package com.bridge.providers;

/** Plain JVM test, no framework: run by `npm run test:native` (#296). */
public final class ChangeGateTest {
  private static final long DEBOUNCE = 2000;

  public static void main(String[] args) {
    oneChangeIsDueAfterTheDebounce();
    aBurstGivesOneEvent();
    ourOwnWriteDoesNotLoop();
    aTabletEditAfterTheEchoWindowSyncs();
    aWriteAfterAChangeDropsItAsAnEcho();
    theDebounceMustBePositive();
    System.out.println("ChangeGateTest: ok");
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }

  private static void oneChangeIsDueAfterTheDebounce() {
    ChangeGate gate = new ChangeGate(DEBOUNCE);
    check(gate.change(1000) == 3000, "a change asks again after the debounce");
    check(!gate.due(2999), "not due before the debounce");
    check(gate.due(3000), "due at the debounce");
    check(!gate.due(5000), "due once only");
  }

  private static void aBurstGivesOneEvent() {
    ChangeGate gate = new ChangeGate(DEBOUNCE);
    gate.change(0);
    gate.change(500);
    long next = gate.change(1500);
    check(!gate.due(2000), "the first deadline is moved by the later changes");
    check(next == 3500, "the last change sets the deadline");
    check(gate.due(3500), "one event after the burst");
    check(!gate.due(9000), "and only one");
  }

  private static void ourOwnWriteDoesNotLoop() {
    ChangeGate gate = new ChangeGate(DEBOUNCE);
    gate.ownWrite(10_000);
    check(gate.change(10_050) == -1, "the provider's echo of our write is dropped");
    check(gate.change(11_999) == -1, "until the debounce has passed");
    check(!gate.due(20_000), "nothing is due from an echo");
  }

  private static void aTabletEditAfterTheEchoWindowSyncs() {
    ChangeGate gate = new ChangeGate(DEBOUNCE);
    gate.ownWrite(10_000);
    check(gate.change(12_000) == 14_000, "a change after the echo window counts");
    check(gate.due(14_000), "and is due");
  }

  private static void aWriteAfterAChangeDropsItAsAnEcho() {
    ChangeGate gate = new ChangeGate(DEBOUNCE);
    gate.change(1000);
    gate.ownWrite(1500);
    check(!gate.due(3000), "a pass that wrote since the change already holds it");
  }

  private static void theDebounceMustBePositive() {
    try {
      new ChangeGate(0);
    } catch (IllegalArgumentException expected) {
      return;
    }
    throw new AssertionError("a debounce of 0 is refused");
  }
}
