package com.relay.localsend;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Plain JVM test, no framework: run by `npm run test:native` from the plugin folder. The Java side
 * of `src/localsend/protocol.json`, the golden file protocol.ts and inkctl read too (#295).
 */
public final class ProtocolTest {
  public static void main(String[] args) throws Exception {
    String golden =
        new String(Files.readAllBytes(Paths.get("src/localsend/protocol.json")), StandardCharsets.UTF_8);
    check(Protocol.API_BASE.equals(field(golden, "apiBase")), "the API base is the golden one");
    check(Receiver.BASE.equals(Protocol.API_BASE + "/"), "the receiver routes under the API base");
    check(
        String.valueOf(Protocol.MAX_MESSAGE_BYTES).equals(field(golden, "maxMessageBytes")),
        "the message limit is the golden one");
    check(
        Receiver.MAX_JSON_BYTES == Protocol.MAX_MESSAGE_BYTES
            && PinnedClient.MAX_ANSWER_BYTES == Protocol.MAX_MESSAGE_BYTES
            && Discovery.MAX_BYTES == Protocol.MAX_MESSAGE_BYTES,
        "the receiver, the client and discovery keep the one limit");
    System.out.println("ProtocolTest: all passed");
  }

  /** The value of `"name": value` in the golden file, without quotes. */
  private static String field(String json, String name) {
    Matcher found =
        Pattern.compile("\"" + name + "\"\\s*:\\s*\"?([^\",}\\s]+)\"?").matcher(json);
    if (!found.find()) {
      throw new AssertionError("protocol.json has no " + name);
    }
    return found.group(1);
  }

  private static void check(boolean ok, String what) {
    if (!ok) {
      throw new AssertionError(what);
    }
  }
}
