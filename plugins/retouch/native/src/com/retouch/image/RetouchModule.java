package com.retouch.image;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.ink2pic.files.EinkPixels;
import com.ink2pic.files.SafePaths;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Runs one edit of {@link Retouch} on the lasso preview PNG and writes the result as a new PNG
 * (#136). It never replaces a file: the JavaScript side names a new file for every write, so a
 * write in shared storage needs FILE:WRITE only (Ink2Pic #62).
 */
public final class RetouchModule extends ReactContextBaseJavaModule {
  /** PNG is lossless, so the encoder ignores its quality. */
  private static final int PNG_QUALITY = 100;
  private static final double NANOS_PER_MS = 1e6;
  /** One edit at a time, off the React Native thread. */
  private final ExecutorService worker = Executors.newSingleThreadExecutor();

  public RetouchModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "RetouchImage";
  }

  /** A new React instance makes a new module: this one's thread stops with it. */
  @Override
  public void invalidate() {
    worker.shutdownNow();
    super.invalidate();
  }

  /**
   * Crops `srcPath` to its centre `width` x `height` (the picture inside the lasso margin), writes
   * that to `beforePath` when it is not empty, runs `edit` (`enhance`, `lighter`, `darker`,
   * `rotate`, `mirror`, `flip`, `invert` or `trim`) and writes the result to `destPath`. Resolves
   * {width, height, left, top, ms}: the result's size and where its top left sits in the picture.
   */
  @ReactMethod
  public void edit(
      String edit,
      String srcPath,
      String beforePath,
      String destPath,
      double width,
      double height,
      double pageWidth,
      Promise promise) {
    try {
      worker.execute(() -> {
        try {
          promise.resolve(run(edit, srcPath, beforePath, destPath, width, height, pageWidth));
        } catch (SafePaths.Refused refused) {
          promise.reject(refused.code, refused.getMessage());
        } catch (Throwable error) {
          // Throwable: an Error left unsettled would leave the button waiting (Ink2Pic #11).
          promise.reject("IO", error.getClass().getName() + ": " + error.getMessage());
        }
      });
    } catch (RejectedExecutionException refused) {
      promise.reject("REJECTED", "the worker refused the edit: " + refused.getMessage());
    }
  }

  private static WritableMap run(
      String editName,
      String srcPath,
      String beforePath,
      String destPath,
      double width,
      double height,
      double pageWidth)
      throws Exception {
    long start = System.nanoTime();
    Retouch.Edit edit = Retouch.Edit.of(editName);
    File source = SafePaths.checkPath(srcPath);
    File target = SafePaths.checkPath(destPath);
    Retouch.Picture picture =
        Retouch.cropCentre(decode(source), whole(width), whole(height));
    if (beforePath != null && !beforePath.isEmpty()) {
      write(picture, SafePaths.checkPath(beforePath));
    }
    int[] size = Retouch.outputSize(edit, picture.width, picture.height, whole(pageWidth));
    picture = scale(picture, size[0], size[1]);
    // Trim moves the picture's top left by the margin it removes, so the page keeps it in place.
    int[] box = edit == Retouch.Edit.TRIM ? Retouch.trimBox(picture) : null;
    picture = box != null ? Retouch.crop(picture, box) : Retouch.apply(edit, picture);
    write(picture, target);
    WritableMap result = Arguments.createMap();
    result.putInt("width", picture.width);
    result.putInt("height", picture.height);
    result.putInt("left", box != null ? box[0] : 0);
    result.putInt("top", box != null ? box[1] : 0);
    result.putDouble("ms", (System.nanoTime() - start) / NANOS_PER_MS);
    return result;
  }

  private static int whole(double value) throws SafePaths.Refused {
    int whole = (int) value;
    if (whole < 1 || whole != value) {
      throw new SafePaths.Refused("BAD_SIZE", "a positive whole size is required: " + value);
    }
    return whole;
  }

  /** The preview's pixels, unpremultiplied ARGB, refused above Ink2Pic's decode caps. */
  private static Retouch.Picture decode(File source) throws Exception {
    if (!source.isFile()) {
      throw new SafePaths.Refused("NOT_FOUND", "no file at " + source);
    }
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(source.getPath(), bounds);
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw new SafePaths.Refused("NOT_IMAGE", "cannot read an image from " + source);
    }
    if ((long) bounds.outWidth * bounds.outHeight > EinkPixels.MAX_DECODE_PIXELS) {
      throw new SafePaths.Refused("TOO_LARGE", "the picture is too large: " + source);
    }
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
    Bitmap decoded = BitmapFactory.decodeFile(source.getPath(), options);
    if (decoded == null) {
      throw new SafePaths.Refused("NOT_IMAGE", "cannot decode " + source);
    }
    try {
      int w = decoded.getWidth();
      int h = decoded.getHeight();
      int[] pixels = new int[w * h];
      // getPixels returns unpremultiplied colours, the form Retouch expects.
      decoded.getPixels(pixels, 0, w, 0, 0, w, h);
      return new Retouch.Picture(pixels, w, h);
    } finally {
      decoded.recycle();
    }
  }

  private static Retouch.Picture scale(Retouch.Picture picture, int width, int height) {
    if (width == picture.width && height == picture.height) {
      return picture;
    }
    Bitmap source =
        Bitmap.createBitmap(picture.argb, picture.width, picture.height, Bitmap.Config.ARGB_8888);
    Bitmap scaled = Bitmap.createScaledBitmap(source, width, height, true);
    source.recycle();
    try {
      int[] pixels = new int[width * height];
      scaled.getPixels(pixels, 0, width, 0, 0, width, height);
      return new Retouch.Picture(pixels, width, height);
    } finally {
      scaled.recycle();
    }
  }

  /** Encodes PNG to a new file; an existing file is refused, never replaced. */
  private static void write(Retouch.Picture picture, File target) throws Exception {
    if (target.exists()) {
      throw new SafePaths.Refused("EXISTS", "will not replace " + target);
    }
    File parent = target.getParentFile();
    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
      throw new IOException("cannot create folder " + parent);
    }
    Bitmap bitmap =
        Bitmap.createBitmap(picture.argb, picture.width, picture.height, Bitmap.Config.ARGB_8888);
    try (OutputStream output = new FileOutputStream(target)) {
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, output)) {
        throw new SafePaths.Refused("ENCODE", "cannot encode PNG for " + target);
      }
    } catch (Exception error) {
      target.delete();
      throw error;
    } finally {
      bitmap.recycle();
    }
  }
}
