package com.relay.localsend;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Renders a received PDF to one page-sized PNG per page, the backgrounds of a new note (#143).
 * Android's own {@link PdfRenderer}, so no dependency. Every page is scaled to fit the page on
 * white and centred; a page of any size costs one bitmap of the page's size, reused. A failure
 * removes every PNG it wrote: the caller never gets a partial set.
 */
final class PdfPages {
  /** Why a PDF gives no pages; `code` is the text the module rejects with. */
  static final class Refused extends Exception {
    private static final long serialVersionUID = 1L;
    final String code;

    Refused(String code) {
      super(code);
      this.code = code;
    }
  }

  private PdfPages() {}

  static List<String> render(File pdf, File outDir, int width, int height, int maxPages)
      throws Refused, IOException {
    if (!outDir.isDirectory() && !outDir.mkdirs()) {
      throw new IOException("cannot make " + outDir.getName());
    }
    List<File> written = new ArrayList<>();
    boolean done = false;
    try {
      List<String> pages = renderAll(pdf, outDir, width, height, maxPages, written);
      done = true;
      return pages;
    } finally {
      if (!done) {
        for (File file : written) {
          file.delete();
        }
        outDir.delete();
      }
    }
  }

  private static List<String> renderAll(
      File pdf, File outDir, int width, int height, int maxPages, List<File> written)
      throws Refused, IOException {
    ParcelFileDescriptor descriptor;
    PdfRenderer renderer;
    try {
      descriptor = ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY);
    } catch (IOException missing) {
      throw new Refused("BROKEN");
    }
    try {
      renderer = new PdfRenderer(descriptor);
    } catch (IOException | SecurityException broken) {
      // A broken file, or one with a password.
      descriptor.close();
      throw new Refused("BROKEN");
    }
    Bitmap bitmap = null;
    try {
      int count = renderer.getPageCount();
      if (count < 1) {
        throw new Refused("BROKEN");
      }
      if (count > maxPages) {
        throw new Refused("PAGES");
      }
      bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
      List<String> paths = new ArrayList<>();
      for (int index = 0; index < count; index++) {
        File png = new File(outDir, "page-" + (index + 1) + ".png");
        written.add(png);
        drawPage(renderer, index, bitmap, width, height);
        OutputStream out = new FileOutputStream(png);
        try {
          if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
            throw new IOException("cannot write page " + (index + 1));
          }
        } finally {
          out.close();
        }
        paths.add(png.getAbsolutePath());
      }
      return paths;
    } finally {
      if (bitmap != null) {
        bitmap.recycle();
      }
      renderer.close();
      descriptor.close();
    }
  }

  private static void drawPage(PdfRenderer renderer, int index, Bitmap bitmap, int width, int height)
      throws Refused {
    PdfRenderer.Page page;
    try {
      page = renderer.openPage(index);
    } catch (RuntimeException broken) {
      throw new Refused("BROKEN");
    }
    try {
      float scale = Math.min((float) width / page.getWidth(), (float) height / page.getHeight());
      Matrix matrix = new Matrix();
      matrix.postScale(scale, scale);
      matrix.postTranslate(
          (width - page.getWidth() * scale) / 2f, (height - page.getHeight() * scale) / 2f);
      bitmap.eraseColor(Color.WHITE);
      page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
    } finally {
      page.close();
    }
  }
}
