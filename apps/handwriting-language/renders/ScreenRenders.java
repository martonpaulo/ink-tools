package com.supernotetools.lingo;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadows.ShadowEnvironment;
import static org.robolectric.Shadows.shadowOf;
import org.robolectric.shadows.ShadowSettings;

/**
 * Renders the app's one screen off screen (#285): the real `SettingsActivity` on Robolectric's
 * native graphics, on the JVM, with no window and no device. `scripts/renders.cjs` compiles and runs
 * it; it writes `<screen>-light-<small|default|large>.png` into the `render.out` folder. The
 * widths: the Nomad's 1404 px, the Manta's 1920 px and a 2560 px one, all at the tablet's 300 ppi
 * (the tokens are in mm, so a wider window shows a wider page). The picture is the whole page,
 * which scrolls on the tablet. Text uses Robolectric's font, not the tablet's.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = ScreenRenders.SDK, shadows = ScreenRenders.AllFilesAccess.class)
public class ScreenRenders {
  /** Android 11, the tablet's release (scripts/build.cjs `MIN_API`). */
  static final int SDK = 30;
  /** The tablet's density, 300 ppi (docs/supernote.md). */
  private static final float DENSITY = 1.875f;
  /** The tablets' screen is 3:4: the page height, the least height a render has, is 4/3 of its width. */
  private static final float HEIGHT_PER_WIDTH = 4f / 3f;

  /**
   * Robolectric has no switch for the all-files access, `Environment.isExternalStorageManager()`; this
   * shadow keeps every other Environment answer and gives that one from `allFiles`.
   */
  @Implements(value = Environment.class)
  public static class AllFilesAccess extends ShadowEnvironment {
    static boolean allFiles = true;

    @Implementation
    protected static boolean isExternalStorageManager() {
      return allFiles;
    }
  }

  /** What a screen state changes from «everything granted, three languages installed». */
  private static final class State {
    boolean files = true;
    boolean overlay = true;
    boolean watcher = true;
    /** The codes left in the cycle. */
    String[] cycle = {"en_US", "pt_BR", "es_ES"};
  }

  private static final int[] WIDTHS = {1404, 1920, 2560};
  private static final String[] SIZES = {"small", "default", "large"};

  @Test
  public void granted() throws Exception {
    render("handwriting-language-granted", new State());
  }

  @Test
  public void filesOff() throws Exception {
    State state = new State();
    state.files = false;
    render("handwriting-language-files-off", state);
  }

  @Test
  public void overlayOff() throws Exception {
    State state = new State();
    state.overlay = false;
    render("handwriting-language-overlay-off", state);
  }

  @Test
  public void writingDetectionOff() throws Exception {
    State state = new State();
    state.watcher = false;
    render("handwriting-language-writing-detection-off", state);
  }

  @Test
  public void oneLanguageOff() throws Exception {
    State state = new State();
    state.cycle = new String[] {"en_US", "es_ES"};
    render("handwriting-language-one-language-off", state);
  }

  /** One state at the three widths; each state is its own test, so its storage starts empty. */
  private void render(String screen, State state) throws IOException {
    File out = new File(System.getProperty("render.out"));
    folder(out);
    for (int size = 0; size < WIDTHS.length; size++) {
      draw(state, WIDTHS[size], new File(out, screen + "-light-" + SIZES[size] + ".png"));
    }
  }

  private static int minHeight(int width) {
    return Math.round(width * HEIGHT_PER_WIDTH);
  }

  /** Makes `folder` and its parents; fails with a message naming it. */
  private static void folder(File folder) throws IOException {
    if (!folder.isDirectory() && !folder.mkdirs()) {
      throw new IOException("cannot create " + folder);
    }
  }

  private void draw(State state, int width, File png) throws IOException {
    int dp = Math.round(width / DENSITY);
    RuntimeEnvironment.setQualifiers("w" + dp + "dp-h" + Math.round(minHeight(width) / DENSITY) + "dp-300dpi");
    Context context = RuntimeEnvironment.getApplication();
    prepare(context, state);
    ActivityController<SettingsActivity> controller = Robolectric.buildActivity(SettingsActivity.class);
    // The manifest's theme, which the tablet applies (scripts/build.cjs).
    controller.get().setTheme(android.R.style.Theme_Material_Light_NoActionBar);
    SettingsActivity activity = controller.setup().get();
    View root = activity.findViewById(android.R.id.content);
    root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
    int height = Math.max(minHeight(width), root.getMeasuredHeight());
    root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
    root.layout(0, 0, width, height);
    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    // The page's own paper colour behind a page shorter than the window.
    bitmap.eraseColor(Ink.PAPER);
    root.draw(new Canvas(bitmap));
    try (FileOutputStream stream = new FileOutputStream(png)) {
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
        throw new IOException("cannot write " + png);
      }
    }
    controller.pause().stop().destroy();
  }

  /** The permissions, the language folders and the preferences one state asks for. */
  private void prepare(Context context, State state) throws IOException {
    AllFilesAccess.allFiles = state.files;
    ShadowSettings.setCanDrawOverlays(state.overlay);
    Settings.Secure.putString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        state.watcher ? new ComponentName(context, WritingWatcher.class).flattenToString() : "");
    // The version line reads the installed package; app.json's version, as the build writes it.
    PackageInfo info = new PackageInfo();
    info.packageName = context.getPackageName();
    info.versionName = System.getProperty("render.version");
    shadowOf(context.getPackageManager()).installPackage(info);
    if (!state.files) {
      // The tablet cannot read the folder without the access, so the screen shows what it shows then.
      return;
    }
    File root = new File(Environment.getExternalStorageDirectory(), Registry.HandwritingLanguageFile.FOLDER);
    File packs = new File(root, Registry.HandwritingLanguageFile.PACKS);
    for (String code : new String[] {"en_US", "pt_BR", "es_ES"}) {
      folder(new File(packs, code));
    }
    File active = new File(new File(root, Registry.HandwritingLanguageFile.CURRENT), "en_US");
    folder(active.getParentFile());
    if (!active.isFile() && !active.createNewFile()) {
      throw new IOException("cannot write " + active);
    }
    new Prefs(context).setCycle(new HashSet<>(Arrays.asList(state.cycle)));
  }
}
