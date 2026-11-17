package com.relay.localsend;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.util.Collections;
import java.util.Date;
import java.util.List;

/**
 * Plain JVM test, no framework: run by `npm run test:native`. A receiver's answer arrives as one
 * datagram on loopback; multicast itself is measured in the device round (#98 Task 8).
 */
public final class DiscoveryTest {
  public static void main(String[] args) throws Exception {
    DatagramSocket socket = new DatagramSocket(0, InetAddress.getLoopbackAddress());
    try {
      final int port = socket.getLocalPort();
      final String answer = "{\"alias\":\"Mac\",\"fingerprint\":\"f\",\"announce\":false}";
      Thread receiver =
          new Thread(
              new Runnable() {
                @Override
                public void run() {
                  try {
                    DatagramSocket out = new DatagramSocket();
                    try {
                      byte[] data = answer.getBytes("UTF-8");
                      out.send(new DatagramPacket(data, data.length, InetAddress.getLoopbackAddress(), port));
                    } finally {
                      out.close();
                    }
                  } catch (Exception error) {
                    throw new AssertionError(error);
                  }
                }
              });
      receiver.start();
      long start = System.nanoTime();
      List<Discovery.Answer> answers = Discovery.collect(socket, 500);
      long ms = (System.nanoTime() - start) / 1_000_000L;
      receiver.join();
      check(answers.size() == 1, "one answer, got " + answers.size());
      check(answers.get(0).ip.equals("127.0.0.1"), "the sender's address: " + answers.get(0).ip);
      check(answers.get(0).text.equals(answer), "the text arrives unparsed");
      // The window is fixed: an answer does not end it early, and nothing extends it.
      check(ms >= 450 && ms < 2000, "collects for the whole window, took " + ms + " ms");

      start = System.nanoTime();
      answers = Discovery.collect(socket, 200);
      ms = (System.nanoTime() - start) / 1_000_000L;
      check(answers.isEmpty(), "no receiver gives no answer");
      check(ms < 1500, "the timeout fires, took " + ms + " ms");
    } finally {
      socket.close();
    }
    // While receiving, only another device's announce is answered (#49).
    check(Discovery.asksForAnswer("{\"fingerprint\":\"b\", \"announce\" : true}", "aa"),
        "another device's announce is answered");
    check(!Discovery.asksForAnswer("{\"fingerprint\":\"aa\",\"announce\":true}", "aa"),
        "our own announce is not");
    check(!Discovery.asksForAnswer("{\"fingerprint\":\"b\",\"announce\":false}", "aa"),
        "an answer is not answered, so two receivers never loop");
    registerAnswers();
    System.out.println("DiscoveryTest ok");
  }

  /**
   * LocalSend answers an announce by `POST /register` to the announcer first (#98, measured): while
   * a send discovers, that body is an answer, and an offer is refused, since nothing receives.
   */
  private static void registerAnswers() throws Exception {
    Identity identity = Identity.create(new Date());
    Discovery.Registrations registrations = new Discovery.Registrations();
    Receiver server =
        Discovery.listen(
            Receiver.tlsSocket(identity, InetAddress.getLoopbackAddress(), 0),
            "{\"alias\":\"Supernote\"}",
            registrations);
    try {
      String base = "https://127.0.0.1:" + server.port() + Receiver.BASE;
      String mac = "{\"alias\":\"Mac\",\"fingerprint\":\"m\",\"port\":53317}";
      PinnedClient.Response info =
          PinnedClient.post(base + "register", Collections.<String, String>emptyMap(),
              mac.getBytes("UTF-8"), null, identity.fingerprint, 3000, 3000);
      check(info.status == 200 && info.body.contains("Supernote"), "register answers our info");
      List<Discovery.Answer> answers = registrations.answers();
      check(answers.size() == 1, "one register answer, got " + answers.size());
      check(answers.get(0).ip.equals("127.0.0.1"), "the peer's address: " + answers.get(0).ip);
      check(answers.get(0).text.equals(mac), "the register body arrives unparsed");
      PinnedClient.Response offer =
          PinnedClient.post(base + "prepare-upload", Collections.<String, String>emptyMap(),
              "{\"files\":{}}".getBytes("UTF-8"), null, identity.fingerprint, 3000, 3000);
      check(offer.status == 403, "a discovery refuses an offer, got " + offer.status);
    } finally {
      server.close();
    }
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
