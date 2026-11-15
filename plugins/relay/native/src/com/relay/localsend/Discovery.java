package com.relay.localsend;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.SocketTimeoutException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * LocalSend discovery (#98): one multicast announce, then every answer for a fixed time. Pure
 * java.net, so the JVM test runs the same code PluginHost does. It only moves bytes: each answer is
 * parsed and checked in TypeScript (`src/localsend/protocol.ts`). While Relay receives (#49),
 * {@link #answer} makes the tablet visible: it announces once and answers each announce it hears
 * by multicast, the protocol's fallback to `/register`, which Relay's receiver also serves.
 */
public final class Discovery {
  /** The largest datagram we keep; a longer one is dropped, as the protocol parser does. */
  public static final int MAX_BYTES = 64 * 1024;

  private static final Charset UTF_8 = Charset.forName("UTF-8");

  private static final Pattern ANNOUNCE = Pattern.compile("\"announce\"\\s*:\\s*true");

  private Discovery() {}

  /** True when a datagram asks to be answered; the TypeScript parser still owns its meaning. */
  static boolean asksForAnswer(String text, String ownFingerprint) {
    return ANNOUNCE.matcher(text).find() && !text.contains(ownFingerprint);
  }

  /**
   * Announces `announce` once on `socket`, then sends `answer` to the group for every other
   * device's announce, until the socket closes. `socket` has joined `group`.
   */
  public static void answer(
      MulticastSocket socket, InetAddress group, int port, String announce, String answer,
      String ownFingerprint) throws IOException {
    byte[] hello = announce.getBytes(UTF_8);
    socket.send(new DatagramPacket(hello, hello.length, group, port));
    byte[] reply = answer.getBytes(UTF_8);
    byte[] buffer = new byte[MAX_BYTES + 1];
    socket.setSoTimeout(0);
    while (!socket.isClosed()) {
      DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
      try {
        socket.receive(packet);
      } catch (IOException closed) {
        return;
      }
      if (packet.getLength() > MAX_BYTES) {
        continue;
      }
      String text = new String(packet.getData(), packet.getOffset(), packet.getLength(), UTF_8);
      if (asksForAnswer(text, ownFingerprint)) {
        socket.send(new DatagramPacket(reply, reply.length, group, port));
      }
    }
  }

  /** One datagram: who sent it and its text, unparsed. */
  public static final class Answer {
    public final String ip;
    public final String text;

    Answer(String ip, String text) {
      this.ip = ip;
      this.text = text;
    }
  }

  /** Joins `group`, sends `announce` to it on `port`, and collects the answers for `timeoutMs`. */
  public static List<Answer> run(String group, int port, String announce, int timeoutMs)
      throws IOException {
    InetAddress address = InetAddress.getByName(group);
    MulticastSocket socket = new MulticastSocket(port);
    try {
      socket.joinGroup(address);
      byte[] data = announce.getBytes(UTF_8);
      socket.send(new DatagramPacket(data, data.length, address, port));
      return collect(socket, timeoutMs);
    } finally {
      socket.close();
    }
  }

  /** Every datagram the socket receives within `timeoutMs`; the deadline is never extended. */
  public static List<Answer> collect(DatagramSocket socket, int timeoutMs) throws IOException {
    List<Answer> answers = new ArrayList<>();
    long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
    // One byte past the limit, so an oversized datagram is seen and dropped.
    byte[] buffer = new byte[MAX_BYTES + 1];
    while (true) {
      long left = (deadline - System.nanoTime()) / 1_000_000L;
      if (left <= 0) {
        return answers;
      }
      socket.setSoTimeout((int) left);
      DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
      try {
        socket.receive(packet);
      } catch (SocketTimeoutException timeout) {
        return answers;
      }
      if (packet.getLength() > MAX_BYTES || packet.getAddress() == null) {
        continue;
      }
      answers.add(
          new Answer(
              packet.getAddress().getHostAddress(),
              new String(packet.getData(), packet.getOffset(), packet.getLength(), UTF_8)));
    }
  }
}
