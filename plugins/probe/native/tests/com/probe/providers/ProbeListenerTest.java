package com.probe.providers;

import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;

/** Plain JVM test, no framework: run by `npm run test:native`. Uses only the loopback interface. */
public final class ProbeListenerTest {
  public static void main(String[] args) throws Exception {
    try (ServerSocket server = ProbeListener.open()) {
      final int port = server.getLocalPort();
      if (port <= 0) {
        throw new AssertionError("a listener has a port");
      }
      Thread client =
          new Thread(
              new Runnable() {
                @Override
                public void run() {
                  try (Socket socket = new Socket(InetAddress.getLoopbackAddress(), port)) {
                    OutputStream out = socket.getOutputStream();
                    out.write("secret payload".getBytes("UTF-8"));
                    out.flush();
                  } catch (Exception error) {
                    throw new AssertionError(error);
                  }
                }
              });
      client.start();
      String line = ProbeListener.awaitOne(server, 5000);
      client.join();
      if (!line.startsWith("listen accept OK one connection from ") || !line.endsWith(", 14 bytes read")) {
        throw new AssertionError("unexpected line: " + line);
      }
      if (line.contains("secret")) {
        throw new AssertionError("the peer's bytes must never be logged");
      }
    }
    try (ServerSocket server = ProbeListener.open()) {
      String line = ProbeListener.awaitOne(server, 200);
      if (!line.equals("listen accept OK no connection in 0 s")) {
        throw new AssertionError("unexpected timeout line: " + line);
      }
    }
    System.out.println("ProbeListenerTest ok");
  }
}
