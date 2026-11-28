package com.relay.localsend;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.net.InetAddress;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Plain JVM test, no framework: run by `npm run test:native` (#49). The send half's
 * {@link PinnedClient} posts to a loopback {@link Receiver}, pinned to the receiver's own v3
 * identity, as an iPhone or a Mac would.
 */
public final class ReceiverTest {
  private static final Map<String, String> NO_HEADERS = Collections.<String, String>emptyMap();

  public static void main(String[] args) throws Exception {
    File folder = Files.createTempDirectory("relay-receiver-").toFile();
    try {
      run(folder);
      chunked();
      extensions();
    } finally {
      for (File file : folder.listFiles()) {
        file.delete();
      }
      folder.delete();
    }
    System.out.println("ReceiverTest ok");
  }

  private static void run(File folder) throws Exception {
    final LinkedBlockingQueue<String> offers = new LinkedBlockingQueue<>();
    final LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();
    final String[] session = new String[2];
    Identity identity = Identity.create(new Date());
    Receiver receiver =
        new Receiver(
            Receiver.tlsSocket(identity, InetAddress.getLoopbackAddress(), 0),
            "{\"alias\":\"Supernote\"}",
            folder,
            new Receiver.Decider() {
              @Override
              public Receiver.Decision decide(String body, String sessionId, String token) {
                offers.add(body);
                if (body.contains("text/plain")) {
                  return new Receiver.Decision(204, "", null, null);
                }
                if (body.contains("image/png")) {
                  session[0] = sessionId;
                  session[1] = token;
                  return new Receiver.Decision(
                      200,
                      "{\"sessionId\":\"" + sessionId + "\",\"files\":{\"f\":\"" + token + "\"}}",
                      "f",
                      "png");
                }
                return new Receiver.Decision(403, "", null, null);
              }
            },
            new Receiver.Sink() {
              @Override
              public void received(String path) {
                received.add(path);
              }

              @Override
              public void cancelled() {
                received.add("cancelled");
              }
            });
    String base = "https://127.0.0.1:" + receiver.port() + Receiver.BASE;
    String pin = identity.fingerprint;
    try {
      PinnedClient.Response info =
          PinnedClient.post(base + "register", NO_HEADERS, bytes("{}"), null, pin, null, 3000, 3000);
      check(info.status == 200 && info.body.contains("Supernote"), "register answers our info");

      PinnedClient.Response text =
          PinnedClient.post(base + "prepare-upload", NO_HEADERS,
              bytes("{\"files\":{\"t\":{\"fileType\":\"text/plain\",\"preview\":\"hi\"}}}"),
              null, pin, null, 3000, 3000);
      check(text.status == 204, "a text offer answers 204, got " + text.status);
      check(offers.poll().contains("\"preview\":\"hi\""), "the decider reads the whole body");

      PinnedClient.Response refused =
          PinnedClient.post(base + "prepare-upload", NO_HEADERS,
              bytes("{\"files\":{\"x\":{\"fileType\":\"image/heic\"}}}"), null, pin, null, 3000, 3000);
      check(refused.status == 403, "a refused offer answers 403");

      PinnedClient.Response image =
          PinnedClient.post(base + "prepare-upload", NO_HEADERS,
              bytes("{\"files\":{\"f\":{\"fileType\":\"image/png\"}}}"), null, pin, null, 3000, 3000);
      check(image.status == 200 && image.body.contains(session[0]), "an image offer opens a session");

      PinnedClient.Response busy =
          PinnedClient.post(base + "prepare-upload", NO_HEADERS,
              bytes("{\"files\":{\"f\":{\"fileType\":\"image/png\"}}}"), null, pin, null, 3000, 3000);
      check(busy.status == 409, "a second offer during a session is busy");

      String query = "upload?sessionId=" + session[0] + "&fileId=f&token=";
      PinnedClient.Response wrong =
          PinnedClient.post(base + query + "nope", NO_HEADERS, bytes("x"), null, pin, null, 3000, 3000);
      check(wrong.status == 403, "a wrong token is refused");

      File png = new File(folder, "sent.png");
      byte[] content = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
      Files.write(png.toPath(), content);
      PinnedClient.Response uploaded =
          PinnedClient.post(base + query + session[1], NO_HEADERS, null, png, pin, null, 3000, 3000);
      check(uploaded.status == 200, "the right token uploads, got " + uploaded.status);
      String path = received.poll(3, TimeUnit.SECONDS);
      check(path != null && path.endsWith(".png"), "the file is handed on");
      check(Arrays.equals(Files.readAllBytes(new File(path).toPath()), content), "it arrives whole");
      check(!path.contains("sent"), "the sender's file name is never used");

      PinnedClient.Response missing =
          PinnedClient.post(base + "nothing", NO_HEADERS, bytes("{}"), null, pin, null, 3000, 3000);
      check(missing.status == 404, "an unknown path is 404");

      byte[] large = new byte[Receiver.MAX_JSON_BYTES + 1];
      Arrays.fill(large, (byte) ' ');
      PinnedClient.Response tooLarge =
          PinnedClient.post(base + "prepare-upload", NO_HEADERS, large, null, pin, null, 3000, 3000);
      check(tooLarge.status == 413, "an oversized offer is 413");
    } finally {
      receiver.close();
    }
  }

  /** A chunked body arrives whole; a cut one and one over the limit do not. */
  private static void extensions() {
    check("pdf".equals(Receiver.extensionOf("pdf")), "a PDF is saved as .pdf");
    check("png".equals(Receiver.extensionOf("png")), "a PNG is saved as .png");
    check("jpg".equals(Receiver.extensionOf("jpg")), "a JPEG is saved as .jpg");
    check("note".equals(Receiver.extensionOf("note")), "a whole note is saved as .note (#504)");
    check("jpg".equals(Receiver.extensionOf("../x")), "any other answer is never a path part");
  }

  private static void chunked() throws Exception {
    Receiver.Request request =
        Receiver.readHead(
            new ByteArrayInputStream(
                bytes("POST /api/localsend/v2/upload?a=1&b=x%20y HTTP/1.1\r\n"
                    + "Transfer-Encoding: chunked\r\n\r\n")));
    check(request != null && "x y".equals(request.query.get("b")), "the query is decoded");
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    check(Receiver.copyBody(new ByteArrayInputStream(bytes("3\r\nabc\r\n2;x=1\r\nde\r\n0\r\n\r\n")),
        request, out, 100), "a chunked body is read");
    check(new String(out.toByteArray(), "UTF-8").equals("abcde"), "the chunks join in order");
    check(!Receiver.copyBody(new ByteArrayInputStream(bytes("3\r\nab")), request,
        new ByteArrayOutputStream(), 100), "a cut chunk is not whole");
    check(!Receiver.copyBody(new ByteArrayInputStream(bytes("ff\r\n")), request,
        new ByteArrayOutputStream(), 100), "a chunk over the limit is refused");
    check(Receiver.readHead(new ByteArrayInputStream(bytes("nonsense\r\n\r\n"))) == null,
        "a malformed request line is refused");
  }

  private static byte[] bytes(String text) throws Exception {
    return text.getBytes("UTF-8");
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
