package com.relay.localsend;

/** Every fixed wait of Device Link's Java, in one place (#295). Pure Java. */
public final class Timeouts {
  /** How long the receiver waits for the next bytes of a request before it drops the connection. */
  public static final int RECEIVER_READ_MS = 15000;
  /** How long the receiver waits for JS to decide an offer before it answers 500. */
  public static final long DECIDE_MS = 10000;

  private Timeouts() {}
}
