package com.relay.localsend;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
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
    System.out.println("DiscoveryTest ok");
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
