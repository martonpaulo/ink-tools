package com.relay.localsend;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.nio.charset.Charset;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.io.ByteArrayInputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Relay's own TLS identity as a LocalSend receiver (#49): an RSA key and a self-signed X.509
 * <b>v3</b> certificate, written as DER here since PluginHost has no certificate builder. The
 * iOS LocalSend app (rustls/webpki) refuses a v1 certificate with `UnsupportedCertVersion`, the
 * defect the owner met with Notipal, so a stored certificate that is not v3 is replaced. Pure Java,
 * so the JVM test runs it. The fingerprint is the SHA-256 of the DER, as LocalSend v2 defines.
 */
public final class Identity {
  public static final String FILE_NAME = "relay-identity.p12";
  /** The file sits in the plugin's own folder; the password only satisfies the PKCS12 format. */
  private static final char[] PASSWORD = "relay".toCharArray();

  private static final String ALIAS = "relay";
  private static final long DAY_MS = 24L * 60 * 60 * 1000;
  private static final long TEN_YEARS_MS = 3653L * DAY_MS;
  private static final Charset UTF_8 = Charset.forName("UTF-8");

  // DER object identifiers, encoded.
  private static final byte[] SHA256_WITH_RSA = {
    0x06, 0x09, 0x2A, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xF7, 0x0D, 0x01, 0x01, 0x0B
  };
  private static final byte[] COMMON_NAME = {0x06, 0x03, 0x55, 0x04, 0x03};
  private static final byte[] BASIC_CONSTRAINTS = {0x06, 0x03, 0x55, 0x1D, 0x13};

  public final KeyStore keyStore;
  public final X509Certificate certificate;
  public final String fingerprint;

  private Identity(KeyStore keyStore, X509Certificate certificate) throws GeneralSecurityException {
    this.keyStore = keyStore;
    this.certificate = certificate;
    this.fingerprint = PinnedClient.sha256Hex(certificate.getEncoded());
  }

  /** The password the key store was written with, for a KeyManagerFactory. */
  public static char[] password() {
    return PASSWORD.clone();
  }

  /**
   * The identity kept in `folder`; a missing or unreadable file, or one whose certificate is not
   * v3, is replaced by a new one.
   */
  public static Identity load(File folder) throws IOException, GeneralSecurityException {
    File file = new File(folder, FILE_NAME);
    Identity stored = read(file);
    if (stored != null && stored.certificate.getVersion() == 3) {
      return stored;
    }
    Identity made = create(new Date());
    write(made.keyStore, file);
    return made;
  }

  private static Identity read(File file) {
    if (!file.isFile()) {
      return null;
    }
    try {
      KeyStore store = KeyStore.getInstance("PKCS12");
      InputStream in = new FileInputStream(file);
      try {
        store.load(in, PASSWORD);
      } finally {
        in.close();
      }
      Certificate certificate = store.getCertificate(ALIAS);
      if (!(certificate instanceof X509Certificate) || store.getKey(ALIAS, PASSWORD) == null) {
        return null;
      }
      return new Identity(store, (X509Certificate) certificate);
    } catch (Exception unreadable) {
      return null;
    }
  }

  /** Writes the key store through a temporary file and one rename. */
  public static void write(KeyStore store, File file) throws IOException, GeneralSecurityException {
    File folder = file.getParentFile();
    if (folder != null && !folder.isDirectory() && !folder.mkdirs()) {
      throw new IOException("cannot make the identity folder");
    }
    File temporary = new File(file.getPath() + ".tmp");
    OutputStream out = new FileOutputStream(temporary);
    try {
      store.store(out, PASSWORD);
    } finally {
      out.close();
    }
    if (!temporary.renameTo(file)) {
      temporary.delete();
      throw new IOException("cannot replace the identity file");
    }
  }

  /** A new key and its v3 certificate, valid from a day before `now` for ten years. */
  public static Identity create(Date now) throws IOException, GeneralSecurityException {
    KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048, new SecureRandom());
    KeyPair pair = generator.generateKeyPair();
    byte[] der =
        certificateDer(
            pair, new Date(now.getTime() - DAY_MS), new Date(now.getTime() + TEN_YEARS_MS), true);
    X509Certificate certificate =
        (X509Certificate)
            CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(der));
    KeyStore store = KeyStore.getInstance("PKCS12");
    store.load(null, null);
    store.setKeyEntry(ALIAS, pair.getPrivate(), PASSWORD, new Certificate[] {certificate});
    return new Identity(store, certificate);
  }

  /**
   * The DER of a self-signed certificate for `pair`, subject and issuer `CN=Relay`: v3 with
   * basicConstraints, or v1 with neither, which only the test makes, to stand for an old file.
   */
  static byte[] certificateDer(KeyPair pair, Date from, Date until, boolean v3)
      throws IOException, GeneralSecurityException {
    byte[] algorithm = sequence(SHA256_WITH_RSA, new byte[] {0x05, 0x00});
    byte[] name =
        sequence(tlv(0x31, sequence(COMMON_NAME, tlv(0x0C, "Relay".getBytes(UTF_8)))));
    byte[] serial = new BigInteger(64, new SecureRandom()).add(BigInteger.ONE).toByteArray();
    // basicConstraints, critical, CA:false (an empty sequence).
    byte[] extensions =
        tlv(
            0xA3,
            sequence(
                sequence(
                    BASIC_CONSTRAINTS,
                    new byte[] {0x01, 0x01, (byte) 0xFF},
                    tlv(0x04, sequence()))));
    byte[] body =
        concat(
            tlv(0x02, serial),
            algorithm,
            name,
            sequence(time(from), time(until)),
            name,
            pair.getPublic().getEncoded());
    byte[] tbs =
        v3
            // [0] EXPLICIT version: INTEGER 2 means v3.
            ? sequence(new byte[] {(byte) 0xA0, 0x03, 0x02, 0x01, 0x02}, body, extensions)
            : sequence(body);
    Signature signer = Signature.getInstance("SHA256withRSA");
    signer.initSign(pair.getPrivate());
    signer.update(tbs);
    byte[] signature = signer.sign();
    byte[] bits = new byte[signature.length + 1];
    System.arraycopy(signature, 0, bits, 1, signature.length);
    return sequence(tbs, algorithm, tlv(0x03, bits));
  }

  /** UTCTime through 2049, GeneralizedTime after, as RFC 5280 4.1.2.5 asks. */
  private static byte[] time(Date date) {
    SimpleDateFormat year = new SimpleDateFormat("yyyy", Locale.US);
    year.setTimeZone(TimeZone.getTimeZone("UTC"));
    boolean utc = Integer.parseInt(year.format(date)) < 2050;
    SimpleDateFormat format =
        new SimpleDateFormat(utc ? "yyMMddHHmmss'Z'" : "yyyyMMddHHmmss'Z'", Locale.US);
    format.setTimeZone(TimeZone.getTimeZone("UTC"));
    return tlv(utc ? 0x17 : 0x18, format.format(date).getBytes(UTF_8));
  }

  private static byte[] sequence(byte[]... parts) throws IOException {
    return tlv(0x30, concat(parts));
  }

  private static byte[] concat(byte[]... parts) throws IOException {
    ByteArrayOutputStream joined = new ByteArrayOutputStream();
    for (byte[] part : parts) {
      joined.write(part);
    }
    return joined.toByteArray();
  }

  /** One DER element: tag, definite length, content. */
  static byte[] tlv(int tag, byte[] content) {
    int length = content.length;
    int lengthBytes = length < 0x80 ? 0 : length < 0x100 ? 1 : length < 0x10000 ? 2 : 3;
    byte[] out = new byte[2 + lengthBytes + length];
    out[0] = (byte) tag;
    if (lengthBytes == 0) {
      out[1] = (byte) length;
    } else {
      out[1] = (byte) (0x80 | lengthBytes);
      for (int i = 0; i < lengthBytes; i++) {
        out[2 + i] = (byte) (length >>> (8 * (lengthBytes - 1 - i)));
      }
    }
    System.arraycopy(content, 0, out, 2 + lengthBytes, length);
    return out;
  }
}
