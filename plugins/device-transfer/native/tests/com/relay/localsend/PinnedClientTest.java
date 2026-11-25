package com.relay.localsend;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.SocketTimeoutException;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.Date;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Plain JVM test, no framework: run by `npm run test:native`. A loopback HTTPS server with a
 * self-signed certificate, made by the JDK's keytool, stands in for a LocalSend receiver.
 */
public final class PinnedClientTest {
  public static void main(String[] args) throws Exception {
    File folder = Files.createTempDirectory("relay-tls-").toFile();
    try {
      run(folder);
    } finally {
      for (File file : folder.listFiles()) {
        file.delete();
      }
      folder.delete();
    }
    System.out.println("PinnedClientTest ok");
  }

  private static void run(File folder) throws Exception {
    // A throwaway store password, made here and never kept.
    char[] pass = UUID.randomUUID().toString().toCharArray();
    File store = new File(folder, "receiver.p12");
    String keytool = new File(System.getProperty("java.home"), "bin/keytool").getPath();
    Process make =
        new ProcessBuilder(
                keytool, "-genkeypair", "-alias", "receiver", "-keyalg", "RSA", "-keysize", "2048",
                "-dname", "CN=receiver", "-validity", "2", "-storetype", "PKCS12",
                "-keystore", store.getPath(), "-storepass", new String(pass))
            .redirectErrorStream(true)
            .start();
    drain(make.getInputStream());
    if (make.waitFor() != 0) {
      throw new AssertionError("keytool failed");
    }
    KeyStore keys = KeyStore.getInstance("PKCS12");
    InputStream in = new FileInputStream(store);
    try {
      keys.load(in, pass);
    } finally {
      in.close();
    }
    X509Certificate certificate = (X509Certificate) keys.getCertificate("receiver");
    String fingerprint = PinnedClient.sha256Hex(certificate.getEncoded());

    KeyManagerFactory factory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    factory.init(keys, pass);
    SSLContext tls = SSLContext.getInstance("TLS");
    tls.init(factory.getKeyManagers(), null, null);
    HttpsServer server = HttpsServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.setHttpsConfigurator(new HttpsConfigurator(tls));
    final AtomicInteger received = new AtomicInteger();
    server.createContext(
        "/api/localsend/v2/prepare-upload",
        new HttpHandler() {
          @Override
          public void handle(HttpExchange exchange) throws java.io.IOException {
            received.set(drain(exchange.getRequestBody()));
            byte[] answer = "{\"sessionId\":\"s\",\"files\":{\"page\":\"t\"}}".getBytes("UTF-8");
            exchange.sendResponseHeaders(200, answer.length);
            OutputStream out = exchange.getResponseBody();
            out.write(answer);
            out.close();
          }
        });
    server.start();
    try {
      String url =
          "https://127.0.0.1:" + server.getAddress().getPort() + "/api/localsend/v2/prepare-upload";
      byte[] body = "{\"info\":{}}".getBytes("UTF-8");

      // The announced fingerprint, in LocalSend's upper case, is accepted.
      PinnedClient.Response ok =
          PinnedClient.post(url, Collections.singletonMap("Content-Type", "application/json"),
              body, null, fingerprint.toUpperCase(), null, 3000, 3000);
      check(ok.status == 200, "pinned receiver answers 200, got " + ok.status);
      check(ok.body.contains("\"sessionId\":\"s\""), "the answer body is read");
      check(received.get() == body.length, "the request body arrives whole");

      // A file body is streamed with its length.
      File png = new File(folder, "page.png");
      Files.write(png.toPath(), new byte[] {1, 2, 3, 4, 5});
      PinnedClient.post(url, Collections.<String, String>emptyMap(), null, png, fingerprint, null, 3000, 3000);
      check(received.get() == 5, "the file body arrives whole");
      check(
          PinnedClient.sha256Hex(png)
              .equals("74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0"),
          "the file hash is SHA-256 in lower-case hex");

      // Another fingerprint is a changed identity, never a silent accept. Its first digit always
      // differs: "00" + the rest was the real pin for one certificate in 256, a flaky failure.
      String wrong = (fingerprint.charAt(0) == '0' ? "1" : "0") + fingerprint.substring(1);
      check(!wrong.equalsIgnoreCase(fingerprint), "the wrong pin differs from the real one");
      try {
        PinnedClient.post(url, Collections.<String, String>emptyMap(), body, null,
            wrong, null, 3000, 3000);
        throw new AssertionError("a wrong fingerprint must fail");
      } catch (Exception error) {
        check(PinnedClient.identityChanged(error), "a wrong pin is IdentityChanged: " + error);
      }

      // HTTPS with no pin is refused before any connection.
      try {
        PinnedClient.post(url, Collections.<String, String>emptyMap(), body, null, null, null, 3000, 3000);
        throw new AssertionError("https without a pin must fail");
      } catch (java.io.IOException expected) {
        check(!PinnedClient.identityChanged(expected), "no pin is not a changed identity");
      }
    } finally {
      server.stop(0);
    }

    requiresClientCertificate(factory, certificate, fingerprint);

    // A receiver that accepts and never answers trips the read timeout, not a hang. Over http the
    // request went out, so it is NoAnswer, as LocalSend holding an offer for the accept is (#98);
    // over https the TLS handshake never ended, so the receiver got nothing: a plain timeout.
    ServerSocket silent = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
    try {
      String path = "://127.0.0.1:" + silent.getLocalPort() + "/api/localsend/v2/prepare-upload";
      long start = System.nanoTime();
      try {
        PinnedClient.post("http" + path, Collections.<String, String>emptyMap(), new byte[] {1}, null, null, null, 1000, 300);
        throw new AssertionError("a silent receiver must time out");
      } catch (SocketTimeoutException expected) {
        long ms = (System.nanoTime() - start) / 1_000_000L;
        check(ms < 3000, "the read timeout fires in time, took " + ms + " ms");
        check(PinnedClient.noAnswer(expected), "a request with no answer is NoAnswer: " + expected);
      }
    } finally {
      silent.close();
    }
    // A fresh socket: macOS refuses a second connection queued behind the closed first one.
    ServerSocket mute = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
    try {
      String url = "https://127.0.0.1:" + mute.getLocalPort() + "/api/localsend/v2/prepare-upload";
      try {
        PinnedClient.post(url, Collections.<String, String>emptyMap(), new byte[] {1}, null, fingerprint, null, 1000, 300);
        throw new AssertionError("a silent TLS handshake must time out");
      } catch (SocketTimeoutException expected) {
        check(!PinnedClient.noAnswer(expected), "a stalled handshake is no offer: " + expected);
      }
    } finally {
      mute.close();
    }
  }

  /**
   * LocalSend 1.18 requires a client certificate and names only its own as an authority (#98);
   * before the fix the sender sent none, and the receiver ended the TLS session with «certificate
   * required». Our identity is presented for that request, and its fingerprint is what arrives.
   */
  private static void requiresClientCertificate(
      KeyManagerFactory receiverKeys, final X509Certificate receiver, String fingerprint)
      throws Exception {
    final AtomicReference<String> presented = new AtomicReference<>();
    TrustManager recorder =
        new X509TrustManager() {
          @Override
          public void checkClientTrusted(X509Certificate[] chain, String authType)
              throws CertificateException {
            try {
              presented.set(PinnedClient.sha256Hex(chain[0].getEncoded()));
            } catch (java.security.GeneralSecurityException error) {
              throw new CertificateException(error);
            }
          }

          @Override
          public void checkServerTrusted(X509Certificate[] chain, String authType)
              throws CertificateException {
            throw new CertificateException("a receiver only");
          }

          @Override
          public X509Certificate[] getAcceptedIssuers() {
            // LocalSend names its own certificate, never ours.
            return new X509Certificate[] {receiver};
          }
        };
    SSLContext tls = SSLContext.getInstance("TLS");
    tls.init(receiverKeys.getKeyManagers(), new TrustManager[] {recorder}, null);
    HttpsServer server =
        HttpsServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.setHttpsConfigurator(
        new HttpsConfigurator(tls) {
          @Override
          public void configure(HttpsParameters params) {
            SSLParameters ssl = getSSLContext().getDefaultSSLParameters();
            ssl.setNeedClientAuth(true);
            params.setSSLParameters(ssl);
          }
        });
    server.createContext(
        "/api/localsend/v2/prepare-upload",
        new HttpHandler() {
          @Override
          public void handle(HttpExchange exchange) throws java.io.IOException {
            drain(exchange.getRequestBody());
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          }
        });
    server.start();
    try {
      String url =
          "https://127.0.0.1:" + server.getAddress().getPort() + "/api/localsend/v2/prepare-upload";
      byte[] body = "{\"info\":{}}".getBytes("UTF-8");
      try {
        PinnedClient.post(url, Collections.<String, String>emptyMap(), body, null, fingerprint,
            null, 3000, 3000);
        throw new AssertionError("a receiver that requires a client certificate refuses none");
      } catch (java.io.IOException expected) {
        check(!PinnedClient.identityChanged(expected), "no client certificate is no changed pin");
      }
      Identity identity = Identity.create(new Date());
      PinnedClient.Response sent =
          PinnedClient.post(url, Collections.<String, String>emptyMap(), body, null, fingerprint,
              identity, 3000, 3000);
      check(sent.status == 204, "with our certificate the receiver answers, got " + sent.status);
      check(
          identity.fingerprint.equals(presented.get()),
          "the receiver sees our identity's certificate, got " + presented.get());
    } finally {
      server.stop(0);
    }
  }

  private static int drain(InputStream in) throws java.io.IOException {
    int total = 0;
    byte[] buffer = new byte[4096];
    int read;
    while ((read = in.read(buffer)) > 0) {
      total += read;
    }
    in.close();
    return total;
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
