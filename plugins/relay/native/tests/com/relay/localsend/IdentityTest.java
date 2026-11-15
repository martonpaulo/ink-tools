package com.relay.localsend;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Date;

/**
 * Plain JVM test, no framework: run by `npm run test:native` (#49). The certificate must be X.509
 * v3, since iOS LocalSend refuses v1 with `UnsupportedCertVersion`.
 */
public final class IdentityTest {
  public static void main(String[] args) throws Exception {
    File folder = Files.createTempDirectory("relay-identity-").toFile();
    try {
      run(folder);
    } finally {
      for (File file : folder.listFiles()) {
        file.delete();
      }
      folder.delete();
    }
    System.out.println("IdentityTest ok");
  }

  private static void run(File folder) throws Exception {
    Identity made = Identity.load(folder);
    check(made.certificate.getVersion() == 3, "the certificate is v3");
    check(made.certificate.getBasicConstraints() == -1, "the certificate is not a CA");
    made.certificate.verify(made.certificate.getPublicKey());
    made.certificate.checkValidity(new Date());
    check(
        made.fingerprint.equals(PinnedClient.sha256Hex(made.certificate.getEncoded())),
        "the fingerprint is the SHA-256 of the DER");
    check(made.fingerprint.matches("[0-9a-f]{64}"), "the fingerprint is lower-case hex");

    Identity again = Identity.load(folder);
    check(again.fingerprint.equals(made.fingerprint), "a stored v3 identity is kept");

    // A certificate from 2050 on uses GeneralizedTime and still parses.
    Identity late = Identity.create(new Date(2600000000000L));
    check(late.certificate.getVersion() == 3, "a late certificate is v3");

    // A stored v1 certificate, as Notipal makes, is replaced.
    File v1 = new File(folder, Identity.FILE_NAME);
    writeV1(v1, folder);
    Identity replaced = Identity.load(folder);
    check(replaced.certificate.getVersion() == 3, "a v1 certificate is replaced by a v3 one");
    check(!replaced.fingerprint.equals(made.fingerprint), "the replacement is a new identity");

    // An unreadable file is a fresh start.
    Files.write(v1.toPath(), new byte[] {1, 2, 3});
    check(Identity.load(folder).certificate.getVersion() == 3, "garbage is replaced");
  }

  /** A key store holding a v1 certificate, the kind Notipal writes. */
  private static void writeV1(File file, File folder) throws Exception {
    KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    KeyPair pair = generator.generateKeyPair();
    byte[] der = Identity.certificateDer(pair, new Date(0), new Date(4000000000000L), false);
    Certificate v1 =
        CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
    check(((X509Certificate) v1).getVersion() == 1, "the stand-in is v1");
    KeyStore store = KeyStore.getInstance("PKCS12");
    store.load(null, null);
    store.setKeyEntry("relay", pair.getPrivate(), Identity.password(), new Certificate[] {v1});
    Identity.write(store, file);
  }

  private static void check(boolean condition, String what) {
    if (!condition) {
      throw new AssertionError(what);
    }
  }
}
