package com.relay.localsend;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.Charset;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * One POST to a LocalSend receiver (#98). A receiver serves HTTPS with a self-signed certificate,
 * so the certificate is accepted only when its SHA-256 equals the fingerprint the receiver
 * announced: the pin replaces the chain and the host name, never a trust-all manager. With our
 * {@link Identity}, its certificate is our TLS client certificate, which LocalSend 1.18 requires.
 * Pure Java, no Android class, so the JVM test runs it against a loopback server. Never logs a body.
 */
public final class PinnedClient {
  /** The largest answer we read; the protocol parser drops anything longer. */
  public static final int MAX_ANSWER_BYTES = 64 * 1024;

  private static final Charset UTF_8 = Charset.forName("UTF-8");

  private PinnedClient() {}

  /** The receiver's certificate is not the one it announced. */
  public static final class IdentityChanged extends CertificateException {
    private static final long serialVersionUID = 1L;

    IdentityChanged() {
      super("the receiver's certificate does not match its fingerprint");
    }
  }

  /**
   * The receiver took the connection, TLS included, and did not answer in time: LocalSend holds a
   * `prepare-upload` until the person accepts the offer (#98). Not «not reachable»: the offer
   * arrived.
   */
  public static final class NoAnswer extends SocketTimeoutException {
    private static final long serialVersionUID = 1L;

    NoAnswer(int readMs) {
      super("connected, no answer in " + readMs + " ms");
    }
  }

  /** True when `error`, or a cause of it, is {@link NoAnswer}. */
  public static boolean noAnswer(Throwable error) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof NoAnswer) {
        return true;
      }
    }
    return false;
  }

  /** A status and at most {@link #MAX_ANSWER_BYTES} of the answer, one byte more when longer. */
  public static final class Response {
    public final int status;
    public final String body;

    Response(int status, String body) {
      this.status = status;
      this.body = body;
    }
  }

  /** Lower-case hex SHA-256 of `data`. */
  public static String sha256Hex(byte[] data) throws GeneralSecurityException {
    return hex(MessageDigest.getInstance("SHA-256").digest(data));
  }

  /** Lower-case hex SHA-256 of a file, read in chunks. */
  public static String sha256Hex(File file) throws IOException, GeneralSecurityException {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    InputStream in = new FileInputStream(file);
    try {
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = in.read(buffer)) > 0) {
        digest.update(buffer, 0, read);
      }
    } finally {
      in.close();
    }
    return hex(digest.digest());
  }

  /** A fingerprint as we compare it: lower case, no separators. */
  public static String normalise(String fingerprint) {
    return fingerprint.replace(":", "").trim().toLowerCase(Locale.ROOT);
  }

  /** True when the chain's first certificate hashes to `pinned`. */
  static boolean matches(X509Certificate[] chain, String pinned) {
    if (chain == null || chain.length == 0 || pinned == null) {
      return false;
    }
    try {
      return sha256Hex(chain[0].getEncoded()).equals(normalise(pinned));
    } catch (GeneralSecurityException error) {
      return false;
    }
  }

  /**
   * POSTs `body` (or the bytes of `file` when `body` is null) to `url`. An `https` URL needs
   * `pinned` and presents `client`, when given, as our certificate; an `http` one sends in the
   * clear, for a receiver that announced `protocol: http`.
   */
  public static Response post(
      String url,
      Map<String, String> headers,
      byte[] body,
      File file,
      String pinned,
      Identity client,
      int connectMs,
      int readMs)
      throws IOException, GeneralSecurityException {
    URL target = new URL(url);
    // LAN only: never through a proxy.
    HttpURLConnection connection = (HttpURLConnection) target.openConnection(Proxy.NO_PROXY);
    try {
      if (connection instanceof HttpsURLConnection) {
        if (pinned == null || pinned.isEmpty()) {
          throw new IOException("an https receiver needs its fingerprint");
        }
        pin((HttpsURLConnection) connection, pinned, client);
      }
      connection.setConnectTimeout(connectMs);
      connection.setReadTimeout(readMs);
      connection.setRequestMethod("POST");
      connection.setDoOutput(true);
      connection.setUseCaches(false);
      for (Map.Entry<String, String> header : headers.entrySet()) {
        connection.setRequestProperty(header.getKey(), header.getValue());
      }
      long length = body != null ? body.length : file.length();
      connection.setFixedLengthStreamingMode(length);
      // TCP and TLS first: a failure here never reached the receiver.
      connection.connect();
      try {
        OutputStream out = connection.getOutputStream();
        try {
          if (body != null) {
            out.write(body);
          } else {
            copy(file, out);
          }
        } finally {
          out.close();
        }
        int status = connection.getResponseCode();
        InputStream in = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        return new Response(status, in == null ? "" : readLimited(in));
      } catch (SocketTimeoutException late) {
        NoAnswer waited = new NoAnswer(readMs);
        waited.initCause(late);
        throw waited;
      }
    } finally {
      connection.disconnect();
    }
  }

  private static void pin(HttpsURLConnection connection, final String pinned, Identity client)
      throws GeneralSecurityException {
    TrustManager manager =
        new X509TrustManager() {
          @Override
          public void checkClientTrusted(X509Certificate[] chain, String authType)
              throws CertificateException {
            throw new CertificateException("no client certificates");
          }

          @Override
          public void checkServerTrusted(X509Certificate[] chain, String authType)
              throws CertificateException {
            if (!matches(chain, pinned)) {
              throw new IdentityChanged();
            }
          }

          @Override
          public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
          }
        };
    SSLContext context = SSLContext.getInstance("TLS");
    context.init(
        client == null ? null : client.clientKeyManagers(), new TrustManager[] {manager}, null);
    connection.setSSLSocketFactory(context.getSocketFactory());
    // The pinned certificate is the identity; a LAN address has no name to check.
    connection.setHostnameVerifier(
        new HostnameVerifier() {
          @Override
          public boolean verify(String host, SSLSession session) {
            return true;
          }
        });
  }

  /** True when `error`, or a cause of it, is {@link IdentityChanged}. */
  public static boolean identityChanged(Throwable error) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof IdentityChanged) {
        return true;
      }
    }
    return false;
  }

  private static void copy(File file, OutputStream out) throws IOException {
    InputStream in = new FileInputStream(file);
    try {
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = in.read(buffer)) > 0) {
        out.write(buffer, 0, read);
      }
    } finally {
      in.close();
    }
  }

  private static String readLimited(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try {
      byte[] buffer = new byte[4096];
      int read;
      while (out.size() <= MAX_ANSWER_BYTES && (read = in.read(buffer)) > 0) {
        out.write(buffer, 0, Math.min(read, MAX_ANSWER_BYTES + 1 - out.size()));
      }
    } finally {
      in.close();
    }
    return new String(out.toByteArray(), UTF_8);
  }

  private static String hex(byte[] bytes) {
    StringBuilder text = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      text.append(String.format(Locale.ROOT, "%02x", b & 0xff));
    }
    return text.toString();
  }
}
