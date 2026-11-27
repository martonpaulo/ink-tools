package com.puzzles.view;

import android.util.Base64;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Writes a game page's PNG, which src/play/pages.ts passes as base64 (#386): sn-plugin-lib has no
 * call that writes bytes, and {@code insertNotePage} takes the page's background as a PNG path in
 * {@code MyStyle/} (#377). The file is written beside its target and renamed, so the host never reads
 * half a page, on a worker thread, as every file module here does.
 */
final class PageFileModule extends ReactContextBaseJavaModule {
  /** The module's name; src/play/pages.ts `PAGE_FILE_MODULE` names the same. */
  static final String NAME = "PuzzlesPages";

  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  PageFileModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return NAME;
  }

  /** Writes the bytes {@code base64} holds to {@code path}; resolves true once the file is in place. */
  @ReactMethod
  public void writeBase64(final String path, final String base64, final Promise promise) {
    worker.execute(
        new Runnable() {
          @Override
          public void run() {
            try {
              write(new File(path), Base64.decode(base64, Base64.DEFAULT));
              promise.resolve(true);
            } catch (Throwable error) {
              String message = error.getMessage() == null ? error.toString() : error.getMessage();
              promise.reject("IO", message, error);
            }
          }
        });
  }

  static void write(File target, byte[] bytes) throws IOException {
    File partial = new File(target.getPath() + ".part");
    try (FileOutputStream out = new FileOutputStream(partial)) {
      out.write(bytes);
      out.getFD().sync();
    }
    if (!partial.renameTo(target)) {
      partial.delete();
      throw new IOException("could not rename " + partial + " to " + target);
    }
  }
}
