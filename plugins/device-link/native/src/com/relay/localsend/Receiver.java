package com.relay.localsend;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URLDecoder;
import java.nio.charset.Charset;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

/**
 * Relay's LocalSend v2 receiver (#49): one HTTPS server, one connection at a time on its own
 * thread. Java only moves bytes and enforces the limits; whether an offer is taken is the
 * TypeScript parser's call, through a {@link Decider}. Pure Java, so the JVM test runs it with
 * {@link PinnedClient} as the sender. Never logs a body, a token or a session id.
 */
public final class Receiver {
  public static final String BASE = Protocol.API_BASE + "/";
  public static final int MAX_JSON_BYTES = Protocol.MAX_MESSAGE_BYTES;
  public static final long MAX_FILE_BYTES = 30L * 1024 * 1024;
  static final int MAX_HEAD_BYTES = 16 * 1024;

  private static final Charset UTF_8 = Charset.forName("UTF-8");
  private static final SecureRandom RANDOM = new SecureRandom();

  /** What to answer a prepare-upload; `fileId` names the one file to expect, or null for none. */
  public static final class Decision {
    public final int status;
    public final String body;
    public final String fileId;
    public final String extension;

    public Decision(int status, String body, String fileId, String extension) {
      this.status = status;
      this.body = body;
      this.fileId = fileId;
      this.extension = extension;
    }
  }

  /** Decides one prepare-upload body; `sessionId` and `token` are the ones the answer must name. */
  public interface Decider {
    Decision decide(String body, String sessionId, String token) throws Exception;
  }

  /** Told when a file arrived whole, or when the sender cancelled. */
  public interface Sink {
    void received(String path);

    void cancelled();
  }

  /**
   * Told of each `/register` body and the peer that sent it (#98): while the send half discovers,
   * LocalSend answers our announce by registering with us first, so that body is the answer.
   */
  public interface Registry {
    void registered(String ip, String body);
  }

  private static final class Session {
    final String id;
    final String fileId;
    final String token;
    final File file;

    Session(String id, String fileId, String token, File file) {
      this.id = id;
      this.fileId = fileId;
      this.token = token;
      this.file = file;
    }
  }

  /** The request line, its decoded query, and the headers in lower case. */
  static final class Request {
    String method;
    String path;
    Map<String, String> query = new HashMap<>();
    Map<String, String> headers = new HashMap<>();
  }

  private final ServerSocket server;
  private final String info;
  private final File folder;
  private final Decider decider;
  private final Sink sink;
  private final Registry registry;
  private final Thread thread;
  private Session session;

  /** Starts serving on `server`; `info` is our JSON for `/info` and `/register`. */
  public Receiver(ServerSocket server, String info, File folder, Decider decider, Sink sink) {
    this(server, info, folder, decider, sink, null);
  }

  /** As above; `registry`, when not null, hears every `/register` body (#98). */
  public Receiver(
      ServerSocket server, String info, File folder, Decider decider, Sink sink,
      Registry registry) {
    this.server = server;
    this.registry = registry;
    this.info = info;
    this.folder = folder;
    this.decider = decider;
    this.sink = sink;
    this.thread =
        new Thread(
            new Runnable() {
              @Override
              public void run() {
                serve();
              }
            },
            "relay-receiver");
    thread.setDaemon(true);
    thread.start();
  }

  /** A TLS server socket on `port` with the identity's key; port 0 picks a free one. */
  public static ServerSocket tlsSocket(Identity identity, InetAddress bind, int port)
      throws IOException, GeneralSecurityException {
    KeyManagerFactory keys =
        KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    keys.init(identity.keyStore, Identity.password());
    SSLContext tls = SSLContext.getInstance("TLS");
    tls.init(keys.getKeyManagers(), null, null);
    ServerSocket socket = tls.getServerSocketFactory().createServerSocket();
    socket.setReuseAddress(true);
    socket.bind(new java.net.InetSocketAddress(bind, port));
    return socket;
  }

  public int port() {
    return server.getLocalPort();
  }

  /** Stops serving and removes a half-received file. */
  public void close() {
    try {
      server.close();
    } catch (IOException ignored) {
      // Closing is best effort.
    }
    thread.interrupt();
    synchronized (this) {
      if (session != null) {
        TextFiles.delete(session.file);
        session = null;
      }
    }
  }

  private void serve() {
    while (!server.isClosed()) {
      Socket socket;
      try {
        socket = server.accept();
      } catch (IOException closed) {
        return;
      }
      try {
        socket.setSoTimeout(Timeouts.RECEIVER_READ_MS);
        handle(socket);
      } catch (Exception dropped) {
        // A broken connection ends that request only.
      } finally {
        try {
          socket.close();
        } catch (IOException ignored) {
          // Closing is best effort.
        }
      }
    }
  }

  /** True for a peer on the LAN (or loopback, for the test): we serve no one else. */
  static boolean isLocalPeer(InetAddress address) {
    return address instanceof Inet4Address
        && (address.isSiteLocalAddress() || address.isLoopbackAddress());
  }

  private void handle(Socket socket) throws Exception {
    InputStream in = socket.getInputStream();
    OutputStream out = socket.getOutputStream();
    if (!isLocalPeer(socket.getInetAddress())) {
      respond(out, 403, "");
      return;
    }
    Request request = readHead(in);
    if (request == null) {
      respond(out, 400, "");
      return;
    }
    String route = request.path.startsWith(BASE) ? request.path.substring(BASE.length()) : "";
    if (route.equals("info") && request.method.equals("GET")) {
      respond(out, 200, info);
    } else if (route.equals("register") && request.method.equals("POST")) {
      String body = readJson(in, request);
      if (body == null) {
        respond(out, 413, "");
        return;
      }
      respond(out, 200, info);
      if (registry != null) {
        registry.registered(socket.getInetAddress().getHostAddress(), body);
      }
    } else if (route.equals("prepare-upload") && request.method.equals("POST")) {
      prepareUpload(in, out, request);
    } else if (route.equals("upload") && request.method.equals("POST")) {
      upload(in, out, request);
    } else if (route.equals("cancel") && request.method.equals("POST")) {
      cancel(out, request);
    } else {
      respond(out, 404, "");
    }
  }

  private void prepareUpload(InputStream in, OutputStream out, Request request) throws Exception {
    String body = readJson(in, request);
    if (body == null) {
      respond(out, 413, "");
      return;
    }
    synchronized (this) {
      if (session != null) {
        respond(out, 409, "");
        return;
      }
    }
    String sessionId = randomHex();
    String token = randomHex();
    Decision decision;
    try {
      decision = decider.decide(body, sessionId, token);
    } catch (Exception undecided) {
      respond(out, 500, "");
      return;
    }
    if (decision.status == 200 && decision.fileId != null) {
      String extension = extensionOf(decision.extension);
      synchronized (this) {
        session =
            new Session(
                sessionId,
                decision.fileId,
                token,
                new File(folder, "received-" + sessionId + "." + extension));
      }
    }
    respond(out, decision.status, decision.body == null ? "" : decision.body);
  }

  private void upload(InputStream in, OutputStream out, Request request) throws IOException {
    Session current;
    synchronized (this) {
      current = session;
    }
    if (current == null
        || !current.id.equals(request.query.get("sessionId"))
        || !current.fileId.equals(request.query.get("fileId"))
        || !current.token.equals(request.query.get("token"))) {
      respond(out, 403, "");
      return;
    }
    if (!folder.isDirectory() && !folder.mkdirs()) {
      respond(out, 500, "");
      return;
    }
    File partial = new File(current.file.getPath() + ".part");
    boolean whole;
    OutputStream file = new FileOutputStream(partial);
    try {
      whole = copyBody(in, request, file, MAX_FILE_BYTES);
    } finally {
      file.close();
    }
    if (!whole) {
      TextFiles.delete(partial);
      respond(out, 413, "");
      return;
    }
    if (!partial.renameTo(current.file)) {
      TextFiles.delete(partial);
      respond(out, 500, "");
      return;
    }
    synchronized (this) {
      session = null;
    }
    respond(out, 200, "");
    sink.received(current.file.getPath());
  }

  private void cancel(OutputStream out, Request request) throws IOException {
    boolean ours;
    synchronized (this) {
      ours = session != null && session.id.equals(request.query.get("sessionId"));
      if (ours) {
        TextFiles.delete(session.file);
        session = null;
      }
    }
    respond(out, ours ? 200 : 403, "");
    if (ours) {
      sink.cancelled();
    }
  }

  /** The request line and headers, within {@link #MAX_HEAD_BYTES}; null when malformed. */
  static Request readHead(InputStream in) throws IOException {
    ByteArrayOutputStream head = new ByteArrayOutputStream();
    int matched = 0;
    while (matched < 4) {
      int next = in.read();
      if (next < 0 || head.size() >= MAX_HEAD_BYTES) {
        return null;
      }
      head.write(next);
      matched = (next == (matched % 2 == 0 ? '\r' : '\n')) ? matched + 1 : (next == '\r' ? 1 : 0);
    }
    String[] lines = new String(head.toByteArray(), UTF_8).split("\r\n");
    String[] first = lines[0].split(" ");
    if (first.length != 3 || !first[2].startsWith("HTTP/1.")) {
      return null;
    }
    Request request = new Request();
    request.method = first[0];
    String target = first[1];
    int question = target.indexOf('?');
    request.path = question < 0 ? target : target.substring(0, question);
    if (question >= 0) {
      for (String pair : target.substring(question + 1).split("&")) {
        int equals = pair.indexOf('=');
        if (equals > 0) {
          request.query.put(
              URLDecoder.decode(pair.substring(0, equals), "UTF-8"),
              URLDecoder.decode(pair.substring(equals + 1), "UTF-8"));
        }
      }
    }
    for (int i = 1; i < lines.length; i++) {
      int colon = lines[i].indexOf(':');
      if (colon > 0) {
        request.headers.put(
            lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT),
            lines[i].substring(colon + 1).trim());
      }
    }
    return request;
  }

  /** The body as UTF-8 text within {@link #MAX_JSON_BYTES}, or null when longer. */
  static String readJson(InputStream in, Request request) throws IOException {
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    return copyBody(in, request, body, MAX_JSON_BYTES) ? new String(body.toByteArray(), UTF_8) : null;
  }

  /**
   * Copies the body, by `Content-Length` or `chunked`, to `out`; false when it is longer than
   * `max` or cut short. A request with neither has no body.
   */
  static boolean copyBody(InputStream in, Request request, OutputStream out, long max)
      throws IOException {
    String encoding = request.headers.get("transfer-encoding");
    if (encoding != null && encoding.toLowerCase(Locale.ROOT).contains("chunked")) {
      long total = 0;
      while (true) {
        String line = readLine(in);
        if (line == null) {
          return false;
        }
        int semicolon = line.indexOf(';');
        long size;
        try {
          size = Long.parseLong((semicolon < 0 ? line : line.substring(0, semicolon)).trim(), 16);
        } catch (NumberFormatException malformed) {
          return false;
        }
        if (size == 0) {
          // Trailers end with an empty line.
          String trailer;
          do {
            trailer = readLine(in);
          } while (trailer != null && !trailer.isEmpty());
          return true;
        }
        total += size;
        if (size < 0 || total > max || !copy(in, out, size)) {
          return false;
        }
        String end = readLine(in);
        if (end == null || !end.isEmpty()) {
          return false;
        }
      }
    }
    String length = request.headers.get("content-length");
    if (length == null) {
      return true;
    }
    long size;
    try {
      size = Long.parseLong(length);
    } catch (NumberFormatException malformed) {
      return false;
    }
    return size >= 0 && size <= max && copy(in, out, size);
  }

  private static boolean copy(InputStream in, OutputStream out, long size) throws IOException {
    byte[] buffer = new byte[64 * 1024];
    long left = size;
    while (left > 0) {
      int read = in.read(buffer, 0, (int) Math.min(buffer.length, left));
      if (read < 0) {
        return false;
      }
      out.write(buffer, 0, read);
      left -= read;
    }
    return true;
  }

  /** One CRLF line of at most 1 KiB, without its end; null at the end of the stream. */
  private static String readLine(InputStream in) throws IOException {
    StringBuilder line = new StringBuilder();
    while (line.length() <= 1024) {
      int next = in.read();
      if (next < 0) {
        return null;
      }
      if (next == '\n') {
        int end = line.length();
        return end > 0 && line.charAt(end - 1) == '\r' ? line.substring(0, end - 1) : line.toString();
      }
      line.append((char) next);
    }
    return null;
  }

  private static void respond(OutputStream out, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(UTF_8);
    String head =
        "HTTP/1.1 "
            + status
            + " "
            + reason(status)
            + "\r\nContent-Type: application/json\r\nContent-Length: "
            + bytes.length
            + "\r\nConnection: close\r\n\r\n";
    try {
      out.write(head.getBytes(UTF_8));
      out.write(bytes);
      out.flush();
    } catch (SocketException gone) {
      // The sender left; nothing to tell it.
    }
  }

  private static String reason(int status) {
    switch (status) {
      case 200:
        return "OK";
      case 204:
        return "No Content";
      case 400:
        return "Bad Request";
      case 403:
        return "Forbidden";
      case 404:
        return "Not Found";
      case 409:
        return "Conflict";
      case 413:
        return "Payload Too Large";
      default:
        return "Error";
    }
  }

  /** The saved file's extension, from the decision alone, never the sender's name (#143). */
  static String extensionOf(String decided) {
    if ("png".equals(decided) || "pdf".equals(decided)) {
      return decided;
    }
    return "jpg";
  }

  private static String randomHex() {
    byte[] bytes = new byte[16];
    RANDOM.nextBytes(bytes);
    StringBuilder text = new StringBuilder();
    for (byte b : bytes) {
      text.append(String.format(Locale.ROOT, "%02x", b & 0xff));
    }
    return text.toString();
  }
}
