package com.supernotetools.lingo;

import android.os.Environment;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

/** {@link LanguageFiles.Disk} over java.io; needs all-files access (MANAGE_EXTERNAL_STORAGE). */
final class AndroidFiles implements LanguageFiles.Disk {
  /** `/sdcard/.data/dictionary` on the tablet (docs/supernote.md › Handwriting recognition language). */
  static String root() {
    return new File(Environment.getExternalStorageDirectory(), ".data/dictionary").getPath();
  }

  @Override
  public List<String> list(String folder) throws IOException {
    String[] names = new File(folder).list();
    if (names == null) {
      throw new IOException("cannot read " + folder);
    }
    return Arrays.asList(names);
  }

  @Override
  public boolean isFolder(String path) {
    return new File(path).isDirectory();
  }

  @Override
  public void createEmpty(String path) throws IOException {
    File file = new File(path);
    if (!file.isFile() && !file.createNewFile()) {
      throw new IOException("cannot create " + path);
    }
  }

  @Override
  public void delete(String path) throws IOException {
    if (!new File(path).delete()) {
      throw new IOException("cannot delete " + path);
    }
  }
}
