package com.relay.localsend;

/**
 * The LocalSend values Java shares with the TypeScript protocol module and inkctl (#295). Their one
 * golden file is `src/localsend/localsend-golden.json`, which `ProtocolTest` reads. Pure Java.
 */
public final class Protocol {
  /** The path every LocalSend v2 route starts with. */
  public static final String API_BASE = "/api/localsend/v2";
  /** The largest JSON message or answer we keep; a longer one is dropped. */
  public static final int MAX_MESSAGE_BYTES = 64 * 1024;

  private Protocol() {}
}
