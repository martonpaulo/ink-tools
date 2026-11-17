package com.probe.providers;

import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Issue #91: can a plugin open a listening TCP port and take one connection from the local network?
 * The phone-to-note design (LocalSend) needs it. Pure java.net, so the same code runs in the JVM
 * test and in PluginHost. Never logs what a peer sends: at most it counts the bytes.
 */
public final class ProbeListener {
  private ProbeListener() {}

  /** The IPv4 addresses of the interfaces that are up, never the loopback one. */
  public static List<String> addresses() throws IOException {
    List<String> found = new ArrayList<>();
    for (NetworkInterface face : Collections.list(NetworkInterface.getNetworkInterfaces())) {
      if (!face.isUp() || face.isLoopback()) {
        continue;
      }
      for (InetAddress address : Collections.list(face.getInetAddresses())) {
        if (address instanceof Inet4Address) {
          found.add(face.getName() + " " + address.getHostAddress());
        }
      }
    }
    return found;
  }

  /** A listener on any free port, on every interface. */
  public static ServerSocket open() throws IOException {
    return new ServerSocket(0);
  }

  /** Waits for one connection and reports it as one line; the peer's bytes are counted, not shown. */
  public static String awaitOne(ServerSocket server, int timeoutMs) {
    try {
      server.setSoTimeout(timeoutMs);
      try (Socket peer = server.accept()) {
        peer.setSoTimeout(2000);
        int bytes = 0;
        InputStream in = peer.getInputStream();
        byte[] buffer = new byte[256];
        try {
          int read;
          while ((read = in.read(buffer)) > 0 && bytes < 4096) {
            bytes += read;
          }
        } catch (SocketTimeoutException ignored) {
          // A peer that sends nothing more is still a connection.
        }
        return ProbeFormat.ok("listen", "accept", "one connection from " + peer.getInetAddress().getHostAddress() + ", " + bytes + " bytes read");
      }
    } catch (SocketTimeoutException timeout) {
      return ProbeFormat.ok("listen", "accept", "no connection in " + timeoutMs / 1000 + " s");
    } catch (Throwable error) {
      return ProbeFormat.failed("listen", "accept", error);
    }
  }
}
