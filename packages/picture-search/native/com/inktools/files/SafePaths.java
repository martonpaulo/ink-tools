package com.inktools.files;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Rules for every URL and path the module touches. Plain Java, so JVM tests run it. */
public final class SafePaths {
  /** Downloads stop above this size: a grid picture is about 50 to 150 KB (brief section 7). */
  public static final long MAX_DOWNLOAD_BYTES = 20L * 1024 * 1024;

  private SafePaths() {}

  /** Thrown with a stable code the JavaScript side reads. */
  public static final class Refused extends Exception {
    public final String code;

    public Refused(String code, String message) {
      super(message);
      this.code = code;
    }
  }

  /** PluginHost blocks cleartext HTTP (brief section 3.7), so only HTTPS is accepted. */
  public static void checkHttps(String url) throws Refused {
    if (url == null || !url.toLowerCase(java.util.Locale.ROOT).startsWith("https://")) {
      throw new Refused("HTTPS_ONLY", "only https:// URLs are allowed: " + url);
    }
  }

  /** The device's shared storage root (the registry's `pluginhost.file-sandbox`). */
  public static final String SHARED_ROOT = Registry.PluginhostFileSandbox.SHARED_ROOT;

  /** The device's export folder, which every plugin may write (#302). */
  public static final String EXPORT =
      SHARED_ROOT + "/" + Registry.PluginhostFileSandbox.EXPORT_FOLDER;

  /**
   * The folders one plugin's module may touch (owner, 2026-11-26, #302): its private folder, the
   * export folder and its own folder under MyStyle, plus any folder of its own the plugin names.
   * Every other path is refused.
   */
  public static final class Roots {
    private final List<String> folders;

    private Roots(List<String> folders) {
      this.folders = Collections.unmodifiableList(folders);
    }

    /** Exactly these absolute folders. */
    public static Roots of(String... folders) {
      List<String> list = new ArrayList<>();
      for (String folder : folders) {
        if (folder == null || !folder.startsWith("/") || folder.length() < 2) {
          throw new IllegalArgumentException("an absolute folder is required: " + folder);
        }
        list.add(folder.endsWith("/") ? folder.substring(0, folder.length() - 1) : folder);
      }
      return new Roots(list);
    }

    /**
     * A plugin's own folders: `<private home>/<pluginId>` in each spelling of the host's data
     * folder (the registry's `pluginhost.file-sandbox`), {@link #EXPORT}, `<shared root>/MyStyle/<name>`
     * (such as `MyStyle/Lookup`) and each of `extra`.
     */
    public static Roots plugin(String pluginId, String name, String... extra) {
      List<String> list = new ArrayList<>();
      for (String home : Registry.PluginhostFileSandbox.PRIVATE_HOMES) {
        list.add(home + "/" + pluginId);
      }
      list.add(EXPORT);
      list.add(SHARED_ROOT + "/" + Registry.PluginhostFileSandbox.SHARED_FOLDER + "/" + name);
      list.addAll(Arrays.asList(extra));
      return of(list.toArray(new String[0]));
    }

    public List<String> folders() {
      return folders;
    }

    /**
     * An absolute path with no empty, "." or ".." segment that, with every link resolved, lies in
     * one of the folders or is one. A link out of a folder is refused (`OUTSIDE_ROOTS`), and so is a
     * path that cannot be resolved.
     */
    public File check(String path) throws Refused {
      File file = checkShape(path);
      String resolved = canonical(file, path);
      for (String folder : folders) {
        String root;
        try {
          root = new File(folder).getCanonicalPath();
        } catch (IOException unresolved) {
          continue;
        }
        if (resolved.equals(root) || resolved.startsWith(root + "/")) {
          return file;
        }
      }
      throw new Refused("OUTSIDE_ROOTS", "the path is outside the plugin's folders: " + path);
    }
  }

  /** An absolute path with no empty, "." or ".." segment; {@link Roots#check} adds the folders. */
  static File checkShape(String path) throws Refused {
    if (path == null || !path.startsWith("/") || path.endsWith("/")) {
      throw new Refused("BAD_PATH", "an absolute file path is required: " + path);
    }
    for (String segment : path.substring(1).split("/", -1)) {
      if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
        throw new Refused("BAD_PATH", "the path has an empty, . or .. segment: " + path);
      }
    }
    return new File(path);
  }

  private static String canonical(File file, String path) throws Refused {
    try {
      return file.getCanonicalPath();
    } catch (IOException unresolved) {
      throw new Refused("BAD_PATH", "the path cannot be resolved: " + path);
    }
  }

  /**
   * Shared storage, where PluginHost counts replacing or renaming a file as a delete, which needs
   * FILE:DELETE (build 0.1.0 (13): SecurityException on library.json and the insert download).
   */
  public static boolean isShared(File target) {
    String path = target.getAbsolutePath();
    return path.startsWith("/storage/") || path.startsWith("/sdcard/");
  }

  /** The temporary file a write goes to before it is renamed into place. */
  public static File partFile(File target) {
    return new File(target.getParentFile(), target.getName() + ".part");
  }
}
